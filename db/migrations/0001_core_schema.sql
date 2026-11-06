-- =====================================================================
-- ZENTRO — core commerce schema
--
-- Everything lives in the private `shop` schema. It is NOT exposed by
-- Supabase's public Data API (only `public` is), so browsers can never
-- read or write these tables with the anon key. All access goes through
-- the Next.js server, which connects with DATABASE_URL.
--
-- Money is stored as integer paise (₹1 = 100 paise) to avoid floating
-- point errors and to match payment-gateway amounts exactly.
--
-- Customer identities come from Supabase Auth (auth.users).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists shop;
revoke all on schema shop from public;

-- ---------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------

create or replace function shop.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------

create table shop.categories (
    id          uuid primary key default gen_random_uuid(),
    parent_id   uuid references shop.categories(id) on delete restrict,
    slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name        text not null check (char_length(name) between 1 and 80),
    description text,
    image_url   text,
    sort_order  integer not null default 0,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    check (parent_id is distinct from id)
);
create index categories_parent_idx on shop.categories (parent_id, sort_order);

create table shop.brands (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name        text not null unique,
    logo_url    text,
    created_at  timestamptz not null default now()
);

create table shop.products (
    id                uuid primary key default gen_random_uuid(),
    slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name              text not null check (char_length(name) between 2 and 200),
    brand_id          uuid references shop.brands(id) on delete set null,
    category_id       uuid not null references shop.categories(id) on delete restrict,
    short_description text,
    description       text,
    highlights        text[] not null default '{}',
    -- [{ "group": "General", "items": [{ "label": "Type", "value": "Over-ear" }] }]
    specifications    jsonb not null default '[]'::jsonb,
    hsn_code          text,
    gst_rate          numeric(5,2) not null default 18 check (gst_rate in (0, 0.25, 3, 5, 12, 18, 28)),
    is_active         boolean not null default true,
    is_featured       boolean not null default false,
    -- maintained by triggers below; never written by application code
    rating_avg        numeric(3,2) not null default 0,
    rating_count      integer not null default 0,
    units_sold        integer not null default 0,
    search_vector     tsvector generated always as (
        setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(short_description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'C')
    ) stored,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index products_category_idx on shop.products (category_id) where is_active;
create index products_brand_idx    on shop.products (brand_id) where is_active;
create index products_search_idx   on shop.products using gin (search_vector);
create index products_name_trgm    on shop.products using gin (lower(name) extensions.gin_trgm_ops);
create index products_created_idx  on shop.products (created_at desc) where is_active;

create table shop.product_media (
    id          uuid primary key default gen_random_uuid(),
    product_id  uuid not null references shop.products(id) on delete cascade,
    kind        text not null default 'image' check (kind in ('image', 'video')),
    url         text not null,
    poster_url  text,
    alt         text not null default '',
    width       integer,
    height      integer,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);
create index product_media_product_idx on shop.product_media (product_id, sort_order);

-- Each sellable unit (e.g. "Black / M"). Products with no options still
-- have exactly one default variant, so cart/order logic is uniform.
create table shop.product_variants (
    id            uuid primary key default gen_random_uuid(),
    product_id    uuid not null references shop.products(id) on delete cascade,
    sku           text not null unique,
    -- { "Color": "Black", "Size": "M" }
    options       jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
    price_paise   integer not null check (price_paise > 0),
    mrp_paise     integer not null check (mrp_paise >= price_paise),
    stock         integer not null default 0 check (stock >= 0),
    weight_grams  integer check (weight_grams > 0),
    media_id      uuid references shop.product_media(id) on delete set null,
    position      integer not null default 0,
    is_active     boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index product_variants_product_idx on shop.product_variants (product_id, position);
create unique index product_variants_options_uniq on shop.product_variants (product_id, options);

-- Promotional banners shown on the homepage.
create table shop.banners (
    id                uuid primary key default gen_random_uuid(),
    title             text not null,
    subtitle          text,
    cta_label         text,
    cta_href          text check (cta_href is null or cta_href ~ '^/'),
    image_url         text not null,
    image_mobile_url  text,
    theme             text not null default 'dark' check (theme in ('dark', 'light')),
    starts_at         timestamptz,
    ends_at           timestamptz,
    sort_order        integer not null default 0,
    is_active         boolean not null default true,
    created_at        timestamptz not null default now()
);

-- Listing view: one row per active product with price range, total
-- stock and primary image. Used by homepage, category and search pages.
create view shop.product_listing as
select
    p.id,
    p.slug,
    p.name,
    p.short_description,
    p.category_id,
    c.slug                  as category_slug,
    c.name                  as category_name,
    p.brand_id,
    b.slug                  as brand_slug,
    b.name                  as brand_name,
    p.is_featured,
    p.rating_avg,
    p.rating_count,
    p.units_sold,
    p.created_at,
    p.search_vector,
    v.min_price_paise,
    v.max_price_paise,
    v.mrp_paise,
    v.total_stock,
    v.variant_count,
    m.url                   as image_url,
    m.alt                   as image_alt
from shop.products p
join shop.categories c on c.id = p.category_id and c.is_active
left join shop.brands b on b.id = p.brand_id
join lateral (
    select
        min(pv.price_paise)                         as min_price_paise,
        max(pv.price_paise)                         as max_price_paise,
        (array_agg(pv.mrp_paise order by pv.price_paise))[1] as mrp_paise,
        sum(pv.stock)::integer                      as total_stock,
        count(*)::integer                           as variant_count
    from shop.product_variants pv
    where pv.product_id = p.id and pv.is_active
) v on v.variant_count > 0
left join lateral (
    select pm.url, pm.alt
    from shop.product_media pm
    where pm.product_id = p.id and pm.kind = 'image'
    order by pm.sort_order
    limit 1
) m on true
where p.is_active;

-- Vocabulary for "did you mean…?" spelling suggestions.
create view shop.search_vocabulary as
select distinct lower(w) as term
from (
    select regexp_split_to_table(extensions.unaccent(p.name), '[^[:alnum:]]+') as w
    from shop.products p where p.is_active
    union all
    select regexp_split_to_table(extensions.unaccent(b.name), '[^[:alnum:]]+') from shop.brands b
    union all
    select regexp_split_to_table(extensions.unaccent(c.name), '[^[:alnum:]]+') from shop.categories c where c.is_active
) words
where char_length(w) >= 3;

-- ---------------------------------------------------------------------
-- Customers (identity = Supabase Auth)
-- ---------------------------------------------------------------------

create table shop.profiles (
    user_id            uuid primary key references auth.users(id) on delete cascade,
    full_name          text check (char_length(full_name) <= 100),
    phone              text check (phone ~ '^[6-9][0-9]{9}$'),
    phone_verified_at  timestamptz,
    marketing_opt_in   boolean not null default false,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create table shop.addresses (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    label       text check (char_length(label) <= 30),
    full_name   text not null check (char_length(full_name) between 2 and 100),
    phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
    line1       text not null check (char_length(line1) between 3 and 200),
    line2       text check (char_length(line2) <= 200),
    landmark    text check (char_length(landmark) <= 100),
    city        text not null check (char_length(city) between 2 and 80),
    state_code  text not null check (state_code ~ '^[A-Z]{2}$'),
    pincode     text not null check (pincode ~ '^[1-9][0-9]{5}$'),
    country     text not null default 'IN' check (country = 'IN'),
    is_default  boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index addresses_user_idx on shop.addresses (user_id);
create unique index addresses_one_default on shop.addresses (user_id) where is_default;

-- ---------------------------------------------------------------------
-- Carts & wishlists
-- ---------------------------------------------------------------------

-- A cart belongs to a signed-in user OR to a guest (identified by the
-- SHA-256 hash of a random httpOnly cookie token). On sign-in the guest
-- cart is merged into the user's cart.
create table shop.carts (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid unique references auth.users(id) on delete cascade,
    guest_token_hash  text unique,
    coupon_code       text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    check ((user_id is null) <> (guest_token_hash is null))
);

create table shop.cart_items (
    cart_id     uuid not null references shop.carts(id) on delete cascade,
    variant_id  uuid not null references shop.product_variants(id) on delete cascade,
    quantity    integer not null check (quantity between 1 and 10),
    added_at    timestamptz not null default now(),
    primary key (cart_id, variant_id)
);

create table shop.wishlist_items (
    user_id     uuid not null references auth.users(id) on delete cascade,
    product_id  uuid not null references shop.products(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------
-- Pricing rules: coupons, shipping
-- ---------------------------------------------------------------------

create table shop.coupons (
    id                  uuid primary key default gen_random_uuid(),
    code                text not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
    description         text not null,
    discount_type       text not null check (discount_type in ('percent', 'fixed')),
    discount_value      integer not null check (discount_value > 0),
    max_discount_paise  integer check (max_discount_paise > 0),
    min_order_paise     integer not null default 0,
    starts_at           timestamptz,
    ends_at             timestamptz,
    usage_limit         integer check (usage_limit > 0),
    per_user_limit      integer check (per_user_limit > 0),
    first_order_only    boolean not null default false,
    used_count          integer not null default 0,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    check (discount_type <> 'percent' or discount_value <= 90)
);

-- First matching rule (lowest priority number) wins.
create table shop.shipping_rates (
    id                  uuid primary key default gen_random_uuid(),
    name                text not null,
    state_codes         text[],                       -- null = all states
    pincode_prefixes    text[],                       -- null = all pincodes
    min_subtotal_paise  integer not null default 0,
    max_subtotal_paise  integer,
    fee_paise           integer not null check (fee_paise >= 0),
    est_days_min        integer not null check (est_days_min >= 0),
    est_days_max        integer not null check (est_days_max >= est_days_min),
    cod_available       boolean not null default false,
    priority            integer not null default 100,
    is_active           boolean not null default true
);

-- Pincodes the business cannot deliver to.
create table shop.unserviceable_pincodes (
    pincode text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
    reason  text
);

-- ---------------------------------------------------------------------
-- Orders, payments, fulfilment
-- ---------------------------------------------------------------------

create sequence shop.order_number_seq start 100001;

create table shop.orders (
    id                 uuid primary key default gen_random_uuid(),
    order_number       text not null unique,
    user_id            uuid references auth.users(id) on delete set null,
    email              text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone              text not null check (phone ~ '^[6-9][0-9]{9}$'),
    -- guests track orders with order number + this secret (hashed)
    guest_access_hash  text,
    status             text not null default 'pending_payment' check (status in (
                           'pending_payment', 'payment_failed', 'confirmed',
                           'processing', 'packed', 'shipped', 'out_for_delivery',
                           'delivered', 'cancelled', 'return_requested', 'returned')),
    payment_status     text not null default 'pending' check (payment_status in (
                           'pending', 'paid', 'failed', 'refund_pending',
                           'partially_refunded', 'refunded')),
    currency           text not null default 'INR' check (currency = 'INR'),
    subtotal_paise     integer not null check (subtotal_paise >= 0),
    discount_paise     integer not null default 0 check (discount_paise >= 0),
    shipping_paise     integer not null default 0 check (shipping_paise >= 0),
    tax_paise          integer not null default 0 check (tax_paise >= 0),   -- GST included in prices
    total_paise        integer not null check (total_paise >= 0),
    coupon_id          uuid references shop.coupons(id) on delete set null,
    coupon_code        text,
    shipping_address   jsonb not null,
    billing_address    jsonb,
    place_of_supply    text not null check (place_of_supply ~ '^[A-Z]{2}$'),
    est_delivery_from  date,
    est_delivery_to    date,
    idempotency_key    text not null unique,
    reservation_expires_at timestamptz,
    placed_at          timestamptz,
    cancelled_at       timestamptz,
    cancel_reason      text,
    delivered_at       timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    check (total_paise = subtotal_paise - discount_paise + shipping_paise)
);
create index orders_user_idx    on shop.orders (user_id, created_at desc);
create index orders_status_idx  on shop.orders (status, created_at desc);
create index orders_pending_idx on shop.orders (reservation_expires_at) where status = 'pending_payment';

create table shop.order_items (
    id                uuid primary key default gen_random_uuid(),
    order_id          uuid not null references shop.orders(id) on delete cascade,
    product_id        uuid references shop.products(id) on delete set null,
    variant_id        uuid references shop.product_variants(id) on delete set null,
    product_name      text not null,
    variant_label     text,
    sku               text not null,
    image_url         text,
    hsn_code          text,
    quantity          integer not null check (quantity > 0),
    unit_price_paise  integer not null check (unit_price_paise > 0),
    unit_mrp_paise    integer not null,
    discount_paise    integer not null default 0,
    line_total_paise  integer not null,
    gst_rate          numeric(5,2) not null,
    taxable_paise     integer not null,
    cgst_paise        integer not null default 0,
    sgst_paise        integer not null default 0,
    igst_paise        integer not null default 0,
    returned_quantity integer not null default 0 check (returned_quantity <= quantity)
);
create index order_items_order_idx   on shop.order_items (order_id);
create index order_items_product_idx on shop.order_items (product_id);

create table shop.order_events (
    id          bigint generated always as identity primary key,
    order_id    uuid not null references shop.orders(id) on delete cascade,
    status      text not null,
    note        text,
    actor       text not null check (actor in ('system', 'customer', 'operations', 'payment_gateway', 'carrier')),
    created_at  timestamptz not null default now()
);
create index order_events_order_idx on shop.order_events (order_id, created_at);

-- Stock held for an order while the customer pays. Released if payment
-- fails or the reservation expires; converted (kept) when paid.
create table shop.inventory_reservations (
    order_id     uuid not null references shop.orders(id) on delete cascade,
    variant_id   uuid not null references shop.product_variants(id) on delete cascade,
    quantity     integer not null check (quantity > 0),
    expires_at   timestamptz not null,
    released_at  timestamptz,
    committed_at timestamptz,
    primary key (order_id, variant_id)
);

create table shop.payments (
    id                   uuid primary key default gen_random_uuid(),
    order_id             uuid not null references shop.orders(id) on delete restrict,
    provider             text not null default 'razorpay' check (provider in ('razorpay')),
    provider_order_id    text not null unique,
    provider_payment_id  text unique,
    amount_paise         integer not null check (amount_paise > 0),
    currency             text not null default 'INR',
    status               text not null default 'created' check (status in (
                             'created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded')),
    method               text,
    error_code           text,
    error_description    text,
    verified_at          timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create index payments_order_idx on shop.payments (order_id);

-- Every webhook delivery is stored once (event id unique) so retries
-- from the gateway are idempotent.
create table shop.payment_webhook_events (
    id            bigint generated always as identity primary key,
    provider      text not null,
    event_id      text not null,
    event_type    text not null,
    payload       jsonb not null,
    received_at   timestamptz not null default now(),
    processed_at  timestamptz,
    error         text,
    unique (provider, event_id)
);

create table shop.shipments (
    id               uuid primary key default gen_random_uuid(),
    order_id         uuid not null references shop.orders(id) on delete cascade,
    carrier          text not null,
    tracking_number  text,
    tracking_url     text check (tracking_url is null or tracking_url ~ '^https://'),
    status           text not null default 'label_created' check (status in (
                         'label_created', 'picked_up', 'in_transit', 'out_for_delivery',
                         'delivered', 'failed_attempt', 'returned_to_origin')),
    shipped_at       timestamptz,
    delivered_at     timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index shipments_order_idx on shop.shipments (order_id);

create table shop.shipment_events (
    id           bigint generated always as identity primary key,
    shipment_id  uuid not null references shop.shipments(id) on delete cascade,
    status       text not null,
    location     text,
    description  text,
    occurred_at  timestamptz not null
);
create index shipment_events_shipment_idx on shop.shipment_events (shipment_id, occurred_at);

create sequence shop.invoice_number_seq start 1;

create table shop.invoices (
    id              uuid primary key default gen_random_uuid(),
    order_id        uuid not null unique references shop.orders(id) on delete restrict,
    invoice_number  text not null unique,
    issued_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Returns & refunds
-- ---------------------------------------------------------------------

create table shop.return_requests (
    id           uuid primary key default gen_random_uuid(),
    order_id     uuid not null references shop.orders(id) on delete restrict,
    user_id      uuid references auth.users(id) on delete set null,
    status       text not null default 'requested' check (status in (
                     'requested', 'approved', 'rejected', 'pickup_scheduled',
                     'picked_up', 'received', 'refunded', 'cancelled')),
    reason       text not null check (reason in (
                     'damaged', 'defective', 'wrong_item', 'not_as_described',
                     'size_fit', 'changed_mind', 'other')),
    details      text check (char_length(details) <= 2000),
    resolution_note text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
create index return_requests_order_idx on shop.return_requests (order_id);

create table shop.return_items (
    return_id      uuid not null references shop.return_requests(id) on delete cascade,
    order_item_id  uuid not null references shop.order_items(id) on delete restrict,
    quantity       integer not null check (quantity > 0),
    primary key (return_id, order_item_id)
);

create table shop.refunds (
    id                  uuid primary key default gen_random_uuid(),
    order_id            uuid not null references shop.orders(id) on delete restrict,
    payment_id          uuid not null references shop.payments(id) on delete restrict,
    return_request_id   uuid references shop.return_requests(id) on delete set null,
    provider_refund_id  text unique,
    amount_paise        integer not null check (amount_paise > 0),
    status              text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
    reason              text,
    created_at          timestamptz not null default now(),
    processed_at        timestamptz,
    updated_at          timestamptz not null default now()
);
create index refunds_order_idx on shop.refunds (order_id);

-- ---------------------------------------------------------------------
-- Reviews (verified purchasers only)
-- ---------------------------------------------------------------------

create table shop.reviews (
    id                 uuid primary key default gen_random_uuid(),
    product_id         uuid not null references shop.products(id) on delete cascade,
    user_id            uuid not null references auth.users(id) on delete cascade,
    order_item_id      uuid not null references shop.order_items(id) on delete cascade,
    display_name       text not null check (char_length(display_name) between 2 and 60),
    rating             integer not null check (rating between 1 and 5),
    title              text check (char_length(title) <= 120),
    body               text check (char_length(body) <= 4000),
    status             text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
    moderation_reason  text,
    helpful_count      integer not null default 0,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    unique (user_id, product_id)
);
create index reviews_product_idx on shop.reviews (product_id, created_at desc) where status = 'published';

create table shop.review_images (
    id            uuid primary key default gen_random_uuid(),
    review_id     uuid not null references shop.reviews(id) on delete cascade,
    storage_path  text not null,
    width         integer,
    height        integer,
    created_at    timestamptz not null default now()
);

create table shop.review_votes (
    review_id   uuid not null references shop.reviews(id) on delete cascade,
    user_id     uuid not null references auth.users(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (review_id, user_id)
);

-- Keep products.rating_avg / rating_count equal to the genuine average
-- of PUBLISHED reviews. Nothing else may write those columns.
create or replace function shop.refresh_product_rating()
returns trigger
language plpgsql
as $$
declare
    pid uuid := coalesce(new.product_id, old.product_id);
begin
    update shop.products p
       set rating_avg   = coalesce(s.avg, 0),
           rating_count = coalesce(s.cnt, 0)
      from (
          select round(avg(rating)::numeric, 2) as avg, count(*)::int as cnt
          from shop.reviews
          where product_id = pid and status = 'published'
      ) s
     where p.id = pid;
    return null;
end;
$$;
create trigger reviews_refresh_rating
after insert or update of rating, status or delete on shop.reviews
for each row execute function shop.refresh_product_rating();

-- ---------------------------------------------------------------------
-- Customer care
-- ---------------------------------------------------------------------

create table shop.faqs (
    id          uuid primary key default gen_random_uuid(),
    topic       text not null,
    question    text not null,
    answer      text not null,
    sort_order  integer not null default 0,
    is_active   boolean not null default true
);

create sequence shop.ticket_number_seq start 10001;

create table shop.support_tickets (
    id             uuid primary key default gen_random_uuid(),
    ticket_number  text not null unique,
    user_id        uuid references auth.users(id) on delete set null,
    name           text not null check (char_length(name) between 2 and 100),
    email          text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone          text check (phone ~ '^[6-9][0-9]{9}$'),
    order_id       uuid references shop.orders(id) on delete set null,
    category       text not null check (category in (
                       'order', 'payment', 'delivery', 'return_refund',
                       'product', 'account', 'other')),
    subject        text not null check (char_length(subject) between 3 and 150),
    status         text not null default 'open' check (status in (
                       'open', 'in_progress', 'awaiting_customer', 'resolved', 'closed')),
    access_hash    text,   -- guests view a ticket with number + secret link
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index support_tickets_user_idx on shop.support_tickets (user_id, created_at desc);

create table shop.ticket_messages (
    id          bigint generated always as identity primary key,
    ticket_id   uuid not null references shop.support_tickets(id) on delete cascade,
    author      text not null check (author in ('customer', 'support')),
    body        text not null check (char_length(body) between 1 and 5000),
    created_at  timestamptz not null default now()
);
create index ticket_messages_ticket_idx on shop.ticket_messages (ticket_id, created_at);

create table shop.site_feedback (
    id          bigint generated always as identity primary key,
    user_id     uuid references auth.users(id) on delete set null,
    page_path   text check (char_length(page_path) <= 300),
    rating      integer check (rating between 1 and 5),
    message     text check (char_length(message) <= 3000),
    created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Platform: notification outbox, rate limiting, account deletion log
-- ---------------------------------------------------------------------

-- Transactional emails/SMS are written here inside the same DB
-- transaction as the business change, then delivered by a worker.
create table shop.notification_outbox (
    id          bigint generated always as identity primary key,
    channel     text not null check (channel in ('email', 'sms')),
    recipient   text not null,
    template    text not null,
    payload     jsonb not null default '{}'::jsonb,
    status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
    attempts    integer not null default 0,
    last_error  text,
    dedupe_key  text unique,
    created_at  timestamptz not null default now(),
    sent_at     timestamptz
);
create index notification_outbox_queued_idx on shop.notification_outbox (created_at) where status = 'queued';

-- Fixed-window rate limiting for sensitive endpoints.
create unlogged table shop.rate_limits (
    bucket        text not null,
    window_start  timestamptz not null,
    hits          integer not null default 0,
    primary key (bucket, window_start)
);

create or replace function shop.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
as $$
declare
    v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
    v_hits   integer;
begin
    insert into shop.rate_limits (bucket, window_start, hits)
    values (p_bucket, v_window, 1)
    on conflict (bucket, window_start) do update set hits = shop.rate_limits.hits + 1
    returning hits into v_hits;
    return v_hits <= p_limit;
end;
$$;

-- Retained only to prove a deletion was carried out (no personal data).
create table shop.account_deletions (
    id            bigint generated always as identity primary key,
    user_id_hash  text not null,
    requested_at  timestamptz not null default now(),
    completed_at  timestamptz
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
    foreach t in array array[
        'categories', 'products', 'product_variants', 'profiles', 'addresses',
        'carts', 'orders', 'payments', 'shipments', 'return_requests',
        'refunds', 'reviews', 'support_tickets'
    ] loop
        execute format(
            'create trigger %I before update on shop.%I for each row execute function shop.touch_updated_at()',
            t || '_touch_updated_at', t);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Defence in depth: RLS on, no policies. Even if `shop` were ever added
-- to the Data API, anon/authenticated roles could read nothing.
-- ---------------------------------------------------------------------

do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'shop' loop
        execute format('alter table shop.%I enable row level security', r.tablename);
    end loop;
end;
$$;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
        execute 'revoke all on schema shop from anon, authenticated';
    end if;
end;
$$;

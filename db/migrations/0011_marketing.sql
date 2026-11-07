-- =====================================================================
-- Marketing: scoped coupons, automatic promotions (sale prices) and
-- scheduled banners. Every price the storefront shows or charges comes
-- from shop.variant_prices, so listings, cart and checkout always agree.
-- =====================================================================

-- ---- coupons ---------------------------------------------------------
alter table shop.coupons
    add column applies_to     text not null default 'all' check (applies_to in ('all', 'categories', 'products')),
    add column category_ids   uuid[] not null default '{}',
    add column product_ids    uuid[] not null default '{}',
    add column combinable     boolean not null default true,   -- also applies to items already on promotion
    add column is_public      boolean not null default false,  -- listed as an offer in cart/checkout
    add column archived_at    timestamptz,
    add column created_by     uuid references shop.staff_users(id) on delete set null,
    add column updated_at     timestamptz not null default now(),
    add constraint coupons_scope_ck check (
        (applies_to = 'all') or (applies_to = 'categories' and cardinality(category_ids) > 0) or (applies_to = 'products' and cardinality(product_ids) > 0)),
    add constraint coupons_window_ck check (ends_at is null or starts_at is null or ends_at > starts_at),
    add constraint coupons_fixed_ck check (discount_type <> 'fixed' or discount_value >= 100);
create trigger coupons_touch_updated_at before update on shop.coupons for each row execute function shop.touch_updated_at();

-- ---- category ancestry (for category-scoped rules) -------------------
create or replace function shop.category_path(p_category uuid) returns uuid[]
language sql stable as $$
    with recursive t(id, parent_id) as (
        select id, parent_id from shop.categories where id = p_category
        union all
        select c.id, c.parent_id from shop.categories c join t on c.id = t.parent_id
    )
    select coalesce(array_agg(id), '{}') from t
$$;

-- ---- promotions: automatic sale prices --------------------------------
create table shop.promotions (
    id              uuid primary key default gen_random_uuid(),
    name            text not null check (char_length(name) between 2 and 80),
    badge           text not null check (char_length(badge) between 2 and 24),   -- shown on product cards, e.g. "Diwali Sale"
    discount_type   text not null check (discount_type in ('percent', 'fixed')),
    discount_value  integer not null check (discount_value > 0),
    applies_to      text not null check (applies_to in ('all', 'categories', 'brands', 'products')),
    category_ids    uuid[] not null default '{}',
    brand_ids       uuid[] not null default '{}',
    product_ids     uuid[] not null default '{}',
    starts_at       timestamptz not null,
    ends_at         timestamptz not null,
    is_active       boolean not null default true,
    created_by      uuid references shop.staff_users(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    check (ends_at > starts_at),
    check (discount_type <> 'percent' or discount_value <= 90),
    check (discount_type <> 'fixed' or discount_value >= 100),
    check ((applies_to = 'all') or (applies_to = 'categories' and cardinality(category_ids) > 0)
        or (applies_to = 'brands' and cardinality(brand_ids) > 0) or (applies_to = 'products' and cardinality(product_ids) > 0))
);
create index promotions_window_idx on shop.promotions (starts_at, ends_at) where is_active;
create trigger promotions_touch_updated_at before update on shop.promotions for each row execute function shop.touch_updated_at();

-- The price a customer pays now: base price less the best running promotion
-- (never below ₹1). One place, used by listings, product pages, cart and checkout.
create view shop.variant_prices as
select v.id as variant_id, v.price_paise as base_price_paise,
       coalesce(best.price, v.price_paise) as price_paise,
       best.id as promotion_id, best.badge as promotion_badge, best.ends_at as promotion_ends_at
from shop.product_variants v
join shop.products p on p.id = v.product_id
left join lateral (
    select pr.id, pr.badge, pr.ends_at,
           greatest(100, v.price_paise - case when pr.discount_type = 'percent' then (v.price_paise::bigint * pr.discount_value / 100)::int
                                              else pr.discount_value end) as price
    from shop.promotions pr
    where pr.is_active and pr.starts_at <= now() and pr.ends_at > now()
      and (pr.applies_to = 'all'
           or (pr.applies_to = 'products' and p.id = any(pr.product_ids))
           or (pr.applies_to = 'brands' and p.brand_id = any(pr.brand_ids))
           or (pr.applies_to = 'categories' and pr.category_ids && shop.category_path(p.category_id)))
    order by price, pr.ends_at
    limit 1
) best on best.price < v.price_paise;

-- listing view now uses the effective price
create or replace view shop.product_listing as
select
    p.id, p.slug, p.name, p.short_description, p.category_id,
    c.slug as category_slug, c.name as category_name,
    p.brand_id, b.slug as brand_slug, b.name as brand_name,
    p.is_featured, p.rating_avg, p.rating_count, p.units_sold, p.created_at, p.search_vector,
    v.min_price_paise, v.max_price_paise, v.mrp_paise, v.total_stock, v.variant_count,
    m.url as image_url, m.alt as image_alt,
    v.promotion_badge
from shop.products p
join shop.categories c on c.id = p.category_id and shop.category_live(c.is_active, c.publish_at)
left join shop.brands b on b.id = p.brand_id
join lateral (
    select min(vp.price_paise) as min_price_paise, max(vp.price_paise) as max_price_paise,
           (array_agg(pv.mrp_paise order by vp.price_paise))[1] as mrp_paise,
           sum(pv.stock)::integer as total_stock, count(*)::integer as variant_count,
           (array_agg(vp.promotion_badge order by vp.price_paise) filter (where vp.promotion_badge is not null))[1] as promotion_badge
    from shop.product_variants pv join shop.variant_prices vp on vp.variant_id = pv.id
    where pv.product_id = p.id and pv.is_active
) v on v.variant_count > 0
left join lateral (
    select pm.url, pm.alt from shop.product_media pm
    where pm.product_id = p.id and pm.kind = 'image' order by pm.sort_order limit 1
) m on true
where shop.product_live(p.is_active, p.publish_at, p.archived_at);

-- what the customer was charged vs. the base price, for promotion reporting
alter table shop.order_items
    add column base_price_paise integer,
    add column promotion_id uuid references shop.promotions(id) on delete set null;

-- ---- banners ------------------------------------------------------------
alter table shop.banners
    add column placement     text not null default 'home' check (placement in ('home', 'category')),
    add column category_id   uuid references shop.categories(id) on delete cascade,
    add column storage_key   text,
    add column mobile_storage_key text,
    add column alt           text check (char_length(alt) <= 160),
    add column created_by    uuid references shop.staff_users(id) on delete set null,
    add column updated_at    timestamptz not null default now(),
    add constraint banners_placement_ck check ((placement = 'home') = (category_id is null)),
    add constraint banners_window_ck check (ends_at is null or starts_at is null or ends_at > starts_at);
create trigger banners_touch_updated_at before update on shop.banners for each row execute function shop.touch_updated_at();

do $$
begin
    execute 'alter table shop.promotions enable row level security';
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

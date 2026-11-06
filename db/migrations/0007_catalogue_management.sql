-- =====================================================================
-- Catalogue management: publication states, SEO, brand visibility,
-- logged stock movements and database-backed media (dev/test driver).
-- =====================================================================

-- ---- products: draft / scheduled / published / archived -------------
-- draft      = is_active false
-- scheduled  = is_active true and publish_at in the future
-- published  = is_active true and (publish_at null or past)
-- archived   = archived_at set (never shown; order history keeps its snapshot)
alter table shop.products
    add column publish_at   timestamptz,
    add column archived_at  timestamptz,
    add column seo_title    text check (char_length(seo_title) <= 70),
    add column seo_description text check (char_length(seo_description) <= 170),
    add column created_by   uuid references shop.staff_users(id) on delete set null,
    add column updated_by   uuid references shop.staff_users(id) on delete set null;

create or replace function shop.product_live(p_active boolean, p_publish_at timestamptz, p_archived_at timestamptz)
returns boolean language sql stable as
$$ select p_active and p_archived_at is null and (p_publish_at is null or p_publish_at <= now()) $$;

-- ---- categories: scheduled visibility + SEO ---------------------------
alter table shop.categories
    add column publish_at      timestamptz,
    add column seo_title       text check (char_length(seo_title) <= 70),
    add column seo_description text check (char_length(seo_description) <= 170),
    add column noindex         boolean not null default false;

create or replace function shop.category_live(p_active boolean, p_publish_at timestamptz)
returns boolean language sql stable as
$$ select p_active and (p_publish_at is null or p_publish_at <= now()) $$;

-- ---- brands: archive without breaking products/history ----------------
alter table shop.brands
    add column is_active  boolean not null default true,
    add column updated_at timestamptz not null default now();

-- ---- listing views use the shared visibility rules ---------------------
create or replace view shop.product_listing as
select
    p.id, p.slug, p.name, p.short_description, p.category_id,
    c.slug as category_slug, c.name as category_name,
    p.brand_id, b.slug as brand_slug, b.name as brand_name,
    p.is_featured, p.rating_avg, p.rating_count, p.units_sold, p.created_at, p.search_vector,
    v.min_price_paise, v.max_price_paise, v.mrp_paise, v.total_stock, v.variant_count,
    m.url as image_url, m.alt as image_alt
from shop.products p
join shop.categories c on c.id = p.category_id and shop.category_live(c.is_active, c.publish_at)
left join shop.brands b on b.id = p.brand_id
join lateral (
    select min(pv.price_paise) as min_price_paise, max(pv.price_paise) as max_price_paise,
           (array_agg(pv.mrp_paise order by pv.price_paise))[1] as mrp_paise,
           sum(pv.stock)::integer as total_stock, count(*)::integer as variant_count
    from shop.product_variants pv where pv.product_id = p.id and pv.is_active
) v on v.variant_count > 0
left join lateral (
    select pm.url, pm.alt from shop.product_media pm
    where pm.product_id = p.id and pm.kind = 'image' order by pm.sort_order limit 1
) m on true
where shop.product_live(p.is_active, p.publish_at, p.archived_at);

create or replace view shop.search_vocabulary as
select distinct lower(w) as term
from (
    select regexp_split_to_table(extensions.unaccent(p.name), '[^[:alnum:]]+') as w
    from shop.products p where shop.product_live(p.is_active, p.publish_at, p.archived_at)
    union all
    select regexp_split_to_table(extensions.unaccent(b.name), '[^[:alnum:]]+') from shop.brands b where b.is_active
    union all
    select regexp_split_to_table(extensions.unaccent(c.name), '[^[:alnum:]]+') from shop.categories c where shop.category_live(c.is_active, c.publish_at)
) words
where char_length(w) >= 3;

-- ---- stock movements: every change to stock is explained -----------------
create table shop.stock_movements (
    id           bigint generated always as identity primary key,
    variant_id   uuid not null references shop.product_variants(id) on delete cascade,
    delta        integer not null check (delta <> 0),
    stock_after  integer not null check (stock_after >= 0),
    reason       text not null check (reason in (
                     'initial', 'correction', 'received', 'damaged', 'lost', 'returned_to_supplier',
                     'customer_return', 'import', 'reconciliation', 'other')),
    note         text check (char_length(note) <= 300),
    reference    text check (char_length(reference) <= 100),
    staff_id     uuid references shop.staff_users(id) on delete set null,
    created_at   timestamptz not null default now()
);
create index stock_movements_variant_idx on shop.stock_movements (variant_id, created_at desc);

-- ---- media files (database storage driver for development / tests) -------
create table shop.media_files (
    id            uuid primary key default gen_random_uuid(),
    content_type  text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
    bytes         bytea not null,
    size_bytes    integer not null check (size_bytes between 1 and 5242880),
    sha256        text not null,
    width         integer,
    height        integer,
    created_by    uuid references shop.staff_users(id) on delete set null,
    created_at    timestamptz not null default now()
);
alter table shop.product_media add column storage_key text;  -- object key / media_files id, for deletion

do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'shop' and tablename in ('stock_movements','media_files') loop
        execute format('alter table shop.%I enable row level security', r.tablename);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

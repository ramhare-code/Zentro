-- =====================================================================
-- Inventory: suppliers, purchase orders, receiving, stock counts.
-- All stock changes still go through shop.stock_movements.
-- =====================================================================

alter table shop.product_variants add column cost_paise integer check (cost_paise >= 0);  -- latest received unit cost

create table shop.suppliers (
    id              uuid primary key default gen_random_uuid(),
    name            text not null check (char_length(name) between 2 and 120),
    contact_name    text check (char_length(contact_name) <= 100),
    email           text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone           text check (char_length(phone) <= 20),
    gstin           text check (gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
    address         text check (char_length(address) <= 500),
    payment_terms   text check (char_length(payment_terms) <= 100),
    lead_time_days  integer check (lead_time_days between 0 and 365),
    notes           text check (char_length(notes) <= 2000),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create unique index suppliers_name_uniq on shop.suppliers (lower(name));
create trigger suppliers_touch_updated_at before update on shop.suppliers for each row execute function shop.touch_updated_at();

create sequence shop.po_number_seq start 1001;

create table shop.purchase_orders (
    id             uuid primary key default gen_random_uuid(),
    po_number      text not null unique,
    supplier_id    uuid not null references shop.suppliers(id) on delete restrict,
    status         text not null default 'draft' check (status in ('draft', 'ordered', 'partially_received', 'received', 'closed', 'cancelled')),
    expected_date  date,
    notes          text check (char_length(notes) <= 2000),
    created_by     uuid references shop.staff_users(id) on delete set null,
    ordered_at     timestamptz,
    received_at    timestamptz,
    closed_at      timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index purchase_orders_status_idx on shop.purchase_orders (status, created_at desc);
create trigger purchase_orders_touch_updated_at before update on shop.purchase_orders for each row execute function shop.touch_updated_at();

create table shop.purchase_order_items (
    id                 uuid primary key default gen_random_uuid(),
    po_id              uuid not null references shop.purchase_orders(id) on delete cascade,
    variant_id         uuid not null references shop.product_variants(id) on delete restrict,
    quantity_ordered   integer not null check (quantity_ordered between 1 and 1000000),
    quantity_received  integer not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
    unit_cost_paise    integer not null check (unit_cost_paise >= 0),
    unique (po_id, variant_id)
);

-- Stock counts (cycle counts / stocktakes). Expected quantities are a
-- snapshot; applying adjusts by (counted − expected) so sales made during
-- the count are not overwritten.
create table shop.stock_counts (
    id           uuid primary key default gen_random_uuid(),
    title        text not null check (char_length(title) between 2 and 120),
    status       text not null default 'open' check (status in ('open', 'applied', 'cancelled')),
    category_id  uuid references shop.categories(id) on delete set null,
    created_by   uuid references shop.staff_users(id) on delete set null,
    applied_by   uuid references shop.staff_users(id) on delete set null,
    created_at   timestamptz not null default now(),
    applied_at   timestamptz
);

create table shop.stock_count_lines (
    count_id      uuid not null references shop.stock_counts(id) on delete cascade,
    variant_id    uuid not null references shop.product_variants(id) on delete cascade,
    expected      integer not null,
    counted       integer check (counted >= 0),
    applied_delta integer,
    primary key (count_id, variant_id)
);

do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'shop'
              and tablename in ('suppliers','purchase_orders','purchase_order_items','stock_counts','stock_count_lines') loop
        execute format('alter table shop.%I enable row level security', r.tablename);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

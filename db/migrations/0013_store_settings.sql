-- =====================================================================
-- Store settings (one row), GST on shipping, seller snapshot on invoices.
-- Values left empty fall back to the app's environment variables.
-- =====================================================================

create table shop.store_settings (
    id                   boolean primary key default true check (id),
    business_name        text check (char_length(business_name) <= 60),
    legal_name           text check (char_length(legal_name) <= 120),
    address              text check (char_length(address) <= 400),
    gstin                text check (gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
    state_code           text check (state_code ~ '^[A-Z]{2}$'),
    support_email        text check (support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    support_phone        text check (char_length(support_phone) <= 20),
    support_hours        text check (char_length(support_hours) <= 80),
    grievance_name       text check (char_length(grievance_name) <= 100),
    grievance_email      text check (grievance_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    return_window_days   integer check (return_window_days between 0 and 60),
    -- 'none': shipping charged without GST; 'highest_item_rate': shipping is part of a
    -- composite supply and taxed at the highest GST rate among the order's items
    shipping_gst_mode    text not null default 'none' check (shipping_gst_mode in ('none', 'highest_item_rate')),
    updated_by           uuid references shop.staff_users(id) on delete set null,
    updated_at           timestamptz not null default now()
    -- GSTIN/state consistency is validated in the app (packages/commerce/src/states.ts)
);
insert into shop.store_settings (id) values (true);
create trigger store_settings_touch_updated_at before update on shop.store_settings for each row execute function shop.touch_updated_at();

alter table shop.orders
    add column shipping_gst_rate      numeric(5,2) not null default 0,
    add column shipping_taxable_paise integer not null default 0,
    add column shipping_cgst_paise    integer not null default 0,
    add column shipping_sgst_paise    integer not null default 0,
    add column shipping_igst_paise    integer not null default 0;

-- seller details as they were when the invoice was issued
alter table shop.invoices add column seller jsonb;

alter table shop.shipping_rates
    add column updated_at timestamptz not null default now(),
    add constraint shipping_rates_subtotal_ck check (max_subtotal_paise is null or max_subtotal_paise >= min_subtotal_paise);
alter table shop.unserviceable_pincodes add column created_at timestamptz not null default now();

do $$
begin
    execute 'alter table shop.store_settings enable row level security';
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

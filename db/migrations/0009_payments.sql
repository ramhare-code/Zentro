-- =====================================================================
-- Payments: gateway fees, settlement matching, reconciliation tracking.
-- =====================================================================

alter table shop.payments
    add column fee_paise          integer check (fee_paise >= 0),          -- Razorpay fee incl. its GST
    add column gateway_tax_paise  integer check (gateway_tax_paise >= 0),  -- GST portion of the fee
    add column settlement_id      text,
    add column settled_at         timestamptz,
    add column last_checked_at    timestamptz;                             -- last direct status check with the gateway
create index payments_status_idx on shop.payments (status, created_at desc);

alter table shop.refunds add column settlement_id text;

alter table shop.payment_webhook_events
    add column attempts     integer not null default 1,
    add column retried_by   uuid references shop.staff_users(id) on delete set null;

-- one row per uploaded settlement report (the file itself is not kept)
create table shop.settlement_imports (
    id             uuid primary key default gen_random_uuid(),
    file_name      text not null check (char_length(file_name) <= 200),
    rows_total     integer not null,
    matched        integer not null,
    mismatched     integer not null,
    unknown        integer not null,
    fees_paise     bigint not null,
    settled_paise  bigint not null,
    created_by     uuid references shop.staff_users(id) on delete set null,
    created_at     timestamptz not null default now()
);
alter table shop.settlement_imports enable row level security;

-- new permission: act on payments (gateway checks, webhook retries, settlement imports)
update shop.admin_roles set permissions = array_append(permissions, 'payments.reconcile')
where key in ('owner', 'manager', 'finance') and not ('payments.reconcile' = any(permissions));

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

-- =====================================================================
-- Finance: cost of goods snapshot on each sale and GST credit notes.
-- =====================================================================

-- unit cost at the moment of sale (from the latest purchase-order cost);
-- null = cost unknown, reported as such rather than guessed
alter table shop.order_items add column unit_cost_paise integer check (unit_cost_paise >= 0);

-- Credit notes reverse GST on an issued invoice when goods are returned or a
-- paid order is cancelled (CGST Act s.34). Refunds that aren't a reversal of
-- supply (e.g. a duplicate payment) don't get one.
create sequence shop.credit_note_seq start 1;
create table shop.credit_notes (
    id                  uuid primary key default gen_random_uuid(),
    credit_note_number  text not null unique,
    order_id            uuid not null references shop.orders(id) on delete restrict,
    invoice_id          uuid not null references shop.invoices(id) on delete restrict,
    refund_id           uuid not null unique references shop.refunds(id) on delete restrict,
    reason              text not null,
    taxable_paise       integer not null check (taxable_paise >= 0),
    cgst_paise          integer not null default 0 check (cgst_paise >= 0),
    sgst_paise          integer not null default 0 check (sgst_paise >= 0),
    igst_paise          integer not null default 0 check (igst_paise >= 0),
    other_paise         integer not null default 0 check (other_paise >= 0),   -- non-taxed part, e.g. shipping
    total_paise         integer not null check (total_paise > 0),
    lines               jsonb not null,   -- [{orderItemId, hsn, gstRate, quantity, taxable, cgst, sgst, igst}]
    issued_at           timestamptz not null default now(),
    check (total_paise = taxable_paise + cgst_paise + sgst_paise + igst_paise + other_paise)
);
create index credit_notes_issued_idx on shop.credit_notes (issued_at);
create index invoices_issued_idx on shop.invoices (issued_at);
alter table shop.credit_notes enable row level security;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

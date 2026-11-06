-- =====================================================================
-- Checkout support + verifiable marketing consent.
-- =====================================================================

-- Order-level messaging preferences captured at checkout.
alter table shop.orders
    add column whatsapp_updates boolean not null default false;

-- Internal staff notes on orders (admin only).
create table shop.order_notes (
    id          bigint generated always as identity primary key,
    order_id    uuid not null references shop.orders(id) on delete cascade,
    staff_id    uuid references shop.staff_users(id) on delete set null,
    staff_email text,
    body        text not null check (char_length(body) between 1 and 2000),
    created_at  timestamptz not null default now()
);
create index order_notes_order_idx on shop.order_notes (order_id, created_at);

-- ---------------------------------------------------------------------
-- Marketing consent: an append-only ledger. The CURRENT consent for a
-- (channel, recipient) is its latest row. Nothing is ever updated, so
-- every grant and withdrawal is provable later (DPDP Act / TRAI).
-- ---------------------------------------------------------------------
create table shop.marketing_consents (
    id          bigint generated always as identity primary key,
    channel     text not null check (channel in ('sms', 'whatsapp', 'email')),
    recipient   text not null,               -- normalised: 10-digit mobile or lowercase email
    user_id     uuid references auth.users(id) on delete set null,
    status      text not null check (status in ('granted', 'withdrawn')),
    source      text not null check (source in (
                    'checkout', 'account', 'unsubscribe_link', 'reply_stop',
                    'provider_optout', 'staff_on_request')),
    wording     text,                        -- exact consent text shown, for evidence
    evidence    jsonb not null default '{}'::jsonb,
    staff_id    uuid references shop.staff_users(id) on delete set null,
    created_at  timestamptz not null default now(),
    check ((channel = 'email' and recipient ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and recipient = lower(recipient))
        or (channel in ('sms', 'whatsapp') and recipient ~ '^[6-9][0-9]{9}$'))
);
create index marketing_consents_lookup on shop.marketing_consents (channel, recipient, id desc);

create trigger marketing_consents_no_update before update or delete on shop.marketing_consents
for each row execute function shop.audit_log_immutable();

create view shop.current_marketing_consent as
select distinct on (channel, recipient) channel, recipient, user_id, status, source, created_at
from shop.marketing_consents
order by channel, recipient, id desc;

-- ---------------------------------------------------------------------
-- Release stock held by unpaid orders whose reservation expired.
-- Returns the number of orders cancelled. Safe to run concurrently.
-- ---------------------------------------------------------------------
create or replace function shop.release_expired_reservations()
returns integer
language plpgsql
as $$
declare
    o record;
    n integer := 0;
begin
    for o in
        select id from shop.orders
        where status in ('pending_payment', 'payment_failed') and reservation_expires_at < now()
        for update skip locked
    loop
        update shop.product_variants v
           set stock = v.stock + r.quantity
          from shop.inventory_reservations r
         where r.order_id = o.id and r.variant_id = v.id and r.released_at is null and r.committed_at is null;
        update shop.inventory_reservations set released_at = now()
         where order_id = o.id and released_at is null and committed_at is null;
        update shop.orders set status = 'cancelled', cancelled_at = now(),
               cancel_reason = 'Payment was not completed in time', payment_status = case when payment_status = 'pending' then 'failed' else payment_status end
         where id = o.id;
        insert into shop.order_events (order_id, status, note, actor) values (o.id, 'cancelled', 'Payment window expired; stock released', 'system');
        n := n + 1;
    end loop;
    return n;
end;
$$;

do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'shop' and tablename in ('order_notes','marketing_consents') loop
        execute format('alter table shop.%I enable row level security', r.tablename);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

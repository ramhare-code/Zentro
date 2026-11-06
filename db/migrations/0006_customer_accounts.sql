-- =====================================================================
-- Customer accounts (Zentro-managed identity), plus schema for reviews,
-- returns and support used by the account area.
--
-- Customer identities move from Supabase's auth.users to shop.customers
-- so sign-up, verification and sessions live with the rest of the store
-- data and use the store's own email/SMS providers.
-- =====================================================================

create table shop.customers (
    id                 uuid primary key default gen_random_uuid(),
    email              text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    email_verified_at  timestamptz,
    full_name          text not null check (char_length(full_name) between 2 and 100),
    phone              text check (phone ~ '^[6-9][0-9]{9}$'),
    phone_verified_at  timestamptz,
    password_hash      text not null,
    status             text not null default 'active' check (status in ('active', 'restricted', 'deleted')),
    restricted_reason  text,
    failed_logins      integer not null default 0,
    locked_until       timestamptz,
    last_login_at      timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create unique index customers_email_uniq on shop.customers (email) where status <> 'deleted';
create index customers_phone_idx on shop.customers (phone);
create trigger customers_touch_updated_at before update on shop.customers for each row execute function shop.touch_updated_at();

create table shop.customer_sessions (
    id            uuid primary key default gen_random_uuid(),
    customer_id   uuid not null references shop.customers(id) on delete cascade,
    token_hash    text not null unique,
    created_at    timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    expires_at    timestamptz not null,
    user_agent    text check (char_length(user_agent) <= 300),
    revoked_at    timestamptz
);
create index customer_sessions_customer_idx on shop.customer_sessions (customer_id) where revoked_at is null;

-- One-time tokens / codes: email verification, password reset, phone OTP.
create table shop.customer_tokens (
    id           uuid primary key default gen_random_uuid(),
    customer_id  uuid not null references shop.customers(id) on delete cascade,
    purpose      text not null check (purpose in ('verify_email', 'reset_password', 'verify_phone')),
    secret_hash  text not null,
    target       text,                 -- phone number being verified
    attempts     integer not null default 0,
    expires_at   timestamptz not null,
    used_at      timestamptz,
    created_at   timestamptz not null default now()
);
create index customer_tokens_lookup on shop.customer_tokens (customer_id, purpose) where used_at is null;
create unique index customer_tokens_hash on shop.customer_tokens (secret_hash) where purpose <> 'verify_phone';

-- Re-point every reference to auth.users onto shop.customers.
do $$
declare
    r record;
    del text;
begin
    for r in
        select c.conname, c.conrelid::regclass::text as tbl, a.attname as col, c.confdeltype
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
          and c.connamespace = 'shop'::regnamespace
    loop
        del := case r.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'r' then 'restrict' else 'no action' end;
        execute format('alter table %s drop constraint %I', r.tbl, r.conname);
        execute format('alter table %s add constraint %I foreign key (%I) references shop.customers(id) on delete %s', r.tbl, r.conname, r.col, del);
    end loop;
end;
$$;

-- Reviews: verified by the delivered order item (guests who bought can review too).
alter table shop.reviews alter column user_id drop not null;
alter table shop.reviews drop constraint reviews_user_id_product_id_key;
alter table shop.reviews add constraint reviews_order_item_uniq unique (order_item_id);
alter table shop.reviews add column auto_flags text[] not null default '{}';

-- Support: assignment, priority, timestamps for SLA.
alter table shop.support_tickets
    add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
    add column assigned_to uuid references shop.staff_users(id) on delete set null,
    add column last_customer_message_at timestamptz,
    add column last_staff_message_at timestamptz;
alter table shop.ticket_messages add column staff_id uuid references shop.staff_users(id) on delete set null;
alter table shop.ticket_messages add column internal boolean not null default false;

alter table shop.return_requests add column refund_id uuid references shop.refunds(id) on delete set null;

-- Templates for account and care messages (email; SMS for phone OTP).
insert into shop.message_templates (key, name, channel, category, subject, body, is_system, approval_status) values
 ('verify_email', 'Verify your email', 'email', 'transactional', 'Confirm your {{store}} account',
  E'Hi {{name}},\n\nConfirm your email to finish setting up your {{store}} account:\n{{action_link}}\n\nThe link expires in 24 hours. If you didn’t sign up, ignore this email.\n\n— Team {{store}}', true, 'approved'),
 ('password_reset', 'Password reset', 'email', 'transactional', 'Reset your {{store}} password',
  E'Hi {{name}},\n\nUse this link to choose a new password (valid for 30 minutes):\n{{action_link}}\n\nIf you didn’t ask for this, you can ignore this email — your password stays the same.\n\n— Team {{store}}', true, 'approved'),
 ('phone_otp', 'Phone verification code', 'sms', 'transactional', null,
  '{{code}} is your {{store}} verification code. It expires in 10 minutes. Do not share it with anyone.', true, 'draft'),
 ('ticket_created', 'Support request received', 'email', 'transactional', 'We’ve received your request {{ticket_number}}',
  E'Hi {{name}},\n\nThanks for contacting {{store}}. Your request {{ticket_number}} is with our team and we’ll reply by email.\n\nView or reply: {{action_link}}\n\n— {{store}} Support', true, 'approved'),
 ('ticket_reply', 'Support reply', 'email', 'transactional', 'Update on your request {{ticket_number}}',
  E'Hi {{name}},\n\nOur team replied to your request {{ticket_number}}:\n\n{{message}}\n\nView the conversation or reply: {{action_link}}\n\n— {{store}} Support', true, 'approved'),
 ('return_update', 'Return update', 'email', 'transactional', 'Update on your return for order {{order_number}}',
  E'Hi {{name}},\n\nYour return for order {{order_number}} is now: {{status}}.\n{{message}}\n\nTrack it here: {{order_link}}\n\n— Team {{store}}', true, 'approved');

do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'shop' and tablename in ('customers','customer_sessions','customer_tokens') loop
        execute format('alter table shop.%I enable row level security', r.tablename);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

-- =====================================================================
-- ZENTRO ADMIN — staff identity, roles, sessions, MFA, audit log
--
-- Staff accounts are completely separate from customer accounts
-- (Supabase auth.users). A customer login can never grant admin access.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Roles. Permission keys are defined in apps/admin/src/lib/permissions.ts;
-- the server validates every key before saving a role.
-- ---------------------------------------------------------------------
create table shop.admin_roles (
    id           uuid primary key default gen_random_uuid(),
    key          text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
    name         text not null unique check (char_length(name) between 2 and 60),
    description  text check (char_length(description) <= 300),
    permissions  text[] not null default '{}',
    is_system    boolean not null default false,   -- seeded roles cannot be deleted
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table shop.staff_users (
    id                  uuid primary key default gen_random_uuid(),
    email               text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    full_name           text not null check (char_length(full_name) between 2 and 100),
    role_id             uuid not null references shop.admin_roles(id) on delete restrict,
    status              text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
    password_hash       text,                     -- scrypt; null until the invite is accepted
    password_changed_at timestamptz,
    totp_secret_enc     text,                     -- AES-256-GCM encrypted base32 secret
    totp_enabled_at     timestamptz,
    totp_last_step      bigint,                   -- prevents reusing the same code twice
    failed_logins       integer not null default 0,
    locked_until        timestamptz,
    last_login_at       timestamptz,
    created_by          uuid references shop.staff_users(id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    check (status <> 'active' or (password_hash is not null and totp_enabled_at is not null))
);
create unique index staff_users_email_uniq on shop.staff_users (email);

create table shop.staff_invites (
    id          uuid primary key default gen_random_uuid(),
    staff_id    uuid not null references shop.staff_users(id) on delete cascade,
    token_hash  text not null unique,
    expires_at  timestamptz not null,
    used_at     timestamptz,
    created_by  uuid references shop.staff_users(id) on delete set null,
    created_at  timestamptz not null default now()
);

-- Password accepted, MFA code still required. Lives for 5 minutes.
create table shop.staff_login_challenges (
    token_hash  text primary key,
    staff_id    uuid not null references shop.staff_users(id) on delete cascade,
    ip          inet,
    attempts    integer not null default 0,
    expires_at  timestamptz not null,
    created_at  timestamptz not null default now()
);

create table shop.staff_recovery_codes (
    staff_id   uuid not null references shop.staff_users(id) on delete cascade,
    code_hash  text not null,
    used_at    timestamptz,
    primary key (staff_id, code_hash)
);

-- Server-side sessions. The cookie holds a random token; only its SHA-256
-- hash is stored, so a database leak does not expose live sessions.
create table shop.staff_sessions (
    id               uuid primary key default gen_random_uuid(),
    staff_id         uuid not null references shop.staff_users(id) on delete cascade,
    token_hash       text not null unique,
    created_at       timestamptz not null default now(),
    last_seen_at     timestamptz not null default now(),
    expires_at       timestamptz not null,       -- absolute lifetime
    reauth_at        timestamptz not null default now(), -- last password/MFA proof (step-up)
    ip               inet,
    user_agent       text check (char_length(user_agent) <= 400),
    revoked_at       timestamptz,
    revoked_reason   text
);
create index staff_sessions_staff_idx on shop.staff_sessions (staff_id) where revoked_at is null;

-- ---------------------------------------------------------------------
-- Tamper-evident audit log: each row stores the SHA-256 of the previous
-- row's hash + its own content. Updates and deletes are refused, so any
-- tampering breaks the chain and is detectable by shop.verify_audit_chain().
-- ---------------------------------------------------------------------
create table shop.audit_log (
    id           bigint generated always as identity primary key,
    occurred_at  timestamptz not null default now(),
    staff_id     uuid references shop.staff_users(id) on delete set null,
    staff_email  text,
    action       text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
    entity_type  text,
    entity_id    text,
    ip           inet,
    user_agent   text,
    details      jsonb not null default '{}'::jsonb,
    prev_hash    text not null,
    hash         text not null
);
create index audit_log_occurred_idx on shop.audit_log (occurred_at desc);
create index audit_log_entity_idx   on shop.audit_log (entity_type, entity_id);
create index audit_log_staff_idx    on shop.audit_log (staff_id, occurred_at desc);

create or replace function shop.audit_log_chain()
returns trigger
language plpgsql
as $$
declare
    v_prev text;
begin
    -- serialise inserts so the chain is strictly ordered
    perform pg_advisory_xact_lock(hashtext('shop.audit_log'));
    select hash into v_prev from shop.audit_log order by id desc limit 1;
    new.prev_hash := coalesce(v_prev, repeat('0', 64));
    new.occurred_at := now();
    new.hash := encode(sha256(convert_to(
        new.prev_hash || '|' || to_char(new.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || coalesce(new.staff_id::text, '') || '|' ||
        new.action || '|' || coalesce(new.entity_type, '') || '|' || coalesce(new.entity_id, '') || '|' ||
        new.details::text, 'UTF8')), 'hex');
    return new;
end;
$$;

create trigger audit_log_chain before insert on shop.audit_log
for each row execute function shop.audit_log_chain();

create or replace function shop.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
    raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update or delete on shop.audit_log
for each row execute function shop.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on shop.audit_log
for each statement execute function shop.audit_log_immutable();

-- Returns the id of the first row whose hash does not match, or null if intact.
create or replace function shop.verify_audit_chain()
returns bigint
language plpgsql
stable
as $$
declare
    r record;
    v_prev text := repeat('0', 64);
    v_hash text;
begin
    for r in select * from shop.audit_log order by id loop
        v_hash := encode(sha256(convert_to(
            v_prev || '|' || to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || coalesce(r.staff_id::text, '') || '|' ||
            r.action || '|' || coalesce(r.entity_type, '') || '|' || coalesce(r.entity_id, '') || '|' ||
            r.details::text, 'UTF8')), 'hex');
        if r.prev_hash <> v_prev or r.hash <> v_hash then
            return r.id;
        end if;
        v_prev := r.hash;
    end loop;
    return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Inventory threshold used by low-stock alerts (Phase 3 extends inventory)
-- ---------------------------------------------------------------------
alter table shop.product_variants
    add column low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0);

-- ---------------------------------------------------------------------
-- Built-in roles (Owner, Manager, Inventory, Support, Finance)
-- ---------------------------------------------------------------------
insert into shop.admin_roles (key, name, description, permissions, is_system) values
('owner', 'Owner', 'Full access, including staff, roles and store settings.', array[
    'dashboard.view','products.read','products.write','products.publish','products.archive',
    'catalog.manage','inventory.read','inventory.adjust','suppliers.manage','purchase_orders.manage',
    'orders.read','orders.update','orders.cancel','orders.notes','customers.read','customers.pii',
    'customers.manage','payments.read','refunds.create','finance.read','finance.export','tax.manage',
    'marketing.manage','analytics.read','reports.export','support.manage','reviews.moderate',
    'notifications.read','messages.read','messages.send','messages.campaigns','messages.approve','messages.templates','messages.consent','messages.settings','staff.manage','roles.manage','audit.read','settings.manage'], true),
('manager', 'Manager', 'Runs day-to-day operations across catalogue, orders, customers and marketing.', array[
    'dashboard.view','products.read','products.write','products.publish','products.archive',
    'catalog.manage','inventory.read','inventory.adjust','suppliers.manage','purchase_orders.manage',
    'orders.read','orders.update','orders.cancel','orders.notes','customers.read','customers.pii',
    'customers.manage','payments.read','refunds.create','finance.read','marketing.manage',
    'analytics.read','reports.export','support.manage','reviews.moderate','notifications.read','audit.read',
    'messages.read','messages.send','messages.campaigns','messages.approve','messages.templates','messages.consent'], true),
('inventory', 'Inventory Staff', 'Products, stock, suppliers and purchase orders.', array[
    'dashboard.view','products.read','products.write','catalog.manage','inventory.read','inventory.adjust',
    'suppliers.manage','purchase_orders.manage','orders.read','notifications.read'], true),
('support', 'Support Staff', 'Customer service: orders, customers, tickets and reviews.', array[
    'dashboard.view','products.read','orders.read','orders.cancel','orders.notes','customers.read',
    'support.manage','reviews.moderate','notifications.read','messages.read','messages.send'], true),
('finance', 'Finance Staff', 'Payments, refunds, invoices, tax and financial reports.', array[
    'dashboard.view','orders.read','payments.read','refunds.create','finance.read','finance.export',
    'tax.manage','analytics.read','reports.export','notifications.read'], true);

do $$
declare t text;
begin
    foreach t in array array['admin_roles', 'staff_users'] loop
        execute format('create trigger %I before update on shop.%I for each row execute function shop.touch_updated_at()',
                       t || '_touch_updated_at', t);
    end loop;
end;
$$;

do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'shop'
              and tablename in ('admin_roles','staff_users','staff_invites','staff_login_challenges','staff_recovery_codes','staff_sessions','audit_log') loop
        execute format('alter table shop.%I enable row level security', r.tablename);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

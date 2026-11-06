-- =====================================================================
-- Customer messaging: templates, campaigns, delivery tracking, settings.
-- Transactional messages (order updates) and promotional campaigns share
-- one outbox so every attempt is recorded in one place.
-- =====================================================================

-- ---- outbox: channels, kinds, provider tracking, costs, scheduling ----
alter table shop.notification_outbox drop constraint notification_outbox_channel_check;
alter table shop.notification_outbox add constraint notification_outbox_channel_check check (channel in ('email', 'sms', 'whatsapp'));
alter table shop.notification_outbox drop constraint notification_outbox_status_check;
alter table shop.notification_outbox add constraint notification_outbox_status_check check (status in (
    'queued',     -- waiting to be sent
    'sending',    -- claimed by a worker
    'sent',       -- accepted by the provider (provider_message_id set)
    'delivered',  -- provider reported delivery
    'read',       -- WhatsApp read receipt
    'failed',     -- provider rejected / delivery failed (after retries)
    'skipped',    -- not attempted: provider or template not configured/approved
    'suppressed', -- not attempted: no consent, quiet hours expired, frequency cap, opted out
    'cancelled'));
alter table shop.notification_outbox
    add column kind text not null default 'transactional' check (kind in ('transactional', 'service', 'promotional')),
    add column campaign_id uuid,
    add column template_id uuid,
    add column staff_id uuid references shop.staff_users(id) on delete set null,
    add column rendered_body text,
    add column provider text,
    add column provider_message_id text,
    add column estimated_cost_paise integer,
    add column actual_cost_paise integer,
    add column send_after timestamptz not null default now(),
    add column next_attempt_at timestamptz not null default now(),
    add column delivered_at timestamptz,
    add column status_updated_at timestamptz;
create index notification_outbox_due_idx on shop.notification_outbox (next_attempt_at) where status = 'queued';
create unique index notification_outbox_provider_msg on shop.notification_outbox (provider, provider_message_id) where provider_message_id is not null;
create index notification_outbox_recipient_idx on shop.notification_outbox (channel, recipient, created_at desc);
create index notification_outbox_campaign_idx on shop.notification_outbox (campaign_id) where campaign_id is not null;

-- Provider-reported status changes, kept for delivery reports.
create table shop.message_status_events (
    id           bigint generated always as identity primary key,
    outbox_id    bigint references shop.notification_outbox(id) on delete cascade,
    provider     text not null,
    provider_message_id text,
    status       text not null,
    detail       jsonb not null default '{}'::jsonb,
    received_at  timestamptz not null default now()
);
create index message_status_events_outbox_idx on shop.message_status_events (outbox_id);

-- ---- templates ----
create table shop.message_templates (
    id                      uuid primary key default gen_random_uuid(),
    key                     text not null check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
    name                    text not null check (char_length(name) between 2 and 100),
    channel                 text not null check (channel in ('email', 'sms', 'whatsapp')),
    category                text not null check (category in ('transactional', 'service', 'promotional')),
    subject                 text check (char_length(subject) <= 150),   -- email only
    body                    text not null check (char_length(body) between 1 and 4000),
    -- SMS (India): DLT registration with the telecom operator
    dlt_template_id         text check (dlt_template_id ~ '^[0-9]{10,25}$'),
    provider_template_id    text check (char_length(provider_template_id) <= 100), -- e.g. MSG91 flow id
    -- WhatsApp Business: template approved by Meta
    whatsapp_template_name  text check (whatsapp_template_name ~ '^[a-z0-9_]{1,512}$'),
    whatsapp_language       text not null default 'en',
    approval_status         text not null default 'draft' check (approval_status in ('draft', 'submitted', 'approved', 'rejected')),
    is_system               boolean not null default false,
    is_active               boolean not null default true,
    created_by              uuid references shop.staff_users(id) on delete set null,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (key, channel)
);
create trigger message_templates_touch_updated_at before update on shop.message_templates
for each row execute function shop.touch_updated_at();

-- ---- campaigns ----
create table shop.message_campaigns (
    id                   uuid primary key default gen_random_uuid(),
    name                 text not null check (char_length(name) between 2 and 120),
    channel              text not null check (channel in ('email', 'sms', 'whatsapp')),
    template_id          uuid not null references shop.message_templates(id) on delete restrict,
    audience             jsonb not null default '{}'::jsonb,   -- segment definition
    coupon_code          text,
    status               text not null default 'draft' check (status in (
                             'draft', 'pending_approval', 'scheduled', 'sending', 'completed', 'cancelled')),
    scheduled_for        timestamptz,
    eligible_count       integer,
    estimated_cost_paise integer,
    created_by           uuid references shop.staff_users(id) on delete set null,
    approved_by          uuid references shop.staff_users(id) on delete set null,
    approved_at          timestamptz,
    started_at           timestamptz,
    completed_at         timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create trigger message_campaigns_touch_updated_at before update on shop.message_campaigns
for each row execute function shop.touch_updated_at();
alter table shop.notification_outbox add constraint notification_outbox_campaign_fk foreign key (campaign_id) references shop.message_campaigns(id) on delete set null;
alter table shop.notification_outbox add constraint notification_outbox_template_fk foreign key (template_id) references shop.message_templates(id) on delete set null;

-- ---- settings (owner-editable, non-secret) ----
create table shop.messaging_settings (
    id                          boolean primary key default true check (id),
    promo_window_start          time not null default '10:00',   -- IST; TRAI promotional window
    promo_window_end            time not null default '21:00',
    promo_max_per_day           integer not null default 1 check (promo_max_per_day between 0 and 10),
    promo_max_per_week          integer not null default 3 check (promo_max_per_week between 0 and 30),
    approval_threshold          integer not null default 200 check (approval_threshold >= 0),
    cost_sms_paise              integer not null default 25,     -- estimates; replace with your contracted rates
    cost_whatsapp_marketing_paise integer not null default 88,
    cost_whatsapp_utility_paise integer not null default 13,
    cost_email_paise            integer not null default 0,
    updated_at                  timestamptz not null default now(),
    updated_by                  uuid references shop.staff_users(id) on delete set null
);
insert into shop.messaging_settings default values;

-- ---- built-in transactional templates ----
insert into shop.message_templates (key, name, channel, category, subject, body, is_system, approval_status) values
 ('order_confirmed', 'Order confirmed', 'email', 'transactional', 'Your {{store}} order {{order_number}} is confirmed',
  E'Hi {{name}},\n\nThanks for shopping with {{store}}! Your order {{order_number}} for {{total}} is confirmed.\n\nTrack it any time: {{order_link}}\n\n— Team {{store}}', true, 'approved'),
 ('order_confirmed', 'Order confirmed', 'sms', 'transactional', null,
  'Hi {{name}}, your {{store}} order {{order_number}} of {{total}} is confirmed. Track: {{order_link}}', true, 'draft'),
 ('order_confirmed', 'Order confirmed', 'whatsapp', 'transactional', null,
  'Hi {{name}}, your {{store}} order {{order_number}} of {{total}} is confirmed. Track: {{order_link}}', true, 'draft'),
 ('order_shipped', 'Order shipped', 'email', 'transactional', 'Your order {{order_number}} has shipped',
  E'Hi {{name}},\n\nGood news — order {{order_number}} is on its way with {{carrier}}.\nTracking number: {{tracking_number}}\n{{tracking_link}}\n\n— Team {{store}}', true, 'approved'),
 ('order_shipped', 'Order shipped', 'sms', 'transactional', null,
  'Your {{store}} order {{order_number}} has shipped via {{carrier}}. Tracking no. {{tracking_number}}. Track: {{order_link}}', true, 'draft'),
 ('order_shipped', 'Order shipped', 'whatsapp', 'transactional', null,
  'Your {{store}} order {{order_number}} has shipped via {{carrier}}. Tracking no. {{tracking_number}}. Track: {{order_link}}', true, 'draft'),
 ('order_out_for_delivery', 'Out for delivery', 'email', 'transactional', 'Order {{order_number}} is out for delivery',
  E'Hi {{name}},\n\nYour order {{order_number}} is out for delivery today.\n\n— Team {{store}}', true, 'approved'),
 ('order_out_for_delivery', 'Out for delivery', 'sms', 'transactional', null,
  'Your {{store}} order {{order_number}} is out for delivery today.', true, 'draft'),
 ('order_out_for_delivery', 'Out for delivery', 'whatsapp', 'transactional', null,
  'Your {{store}} order {{order_number}} is out for delivery today.', true, 'draft'),
 ('order_delivered', 'Order delivered', 'email', 'transactional', 'Order {{order_number}} delivered',
  E'Hi {{name}},\n\nYour order {{order_number}} has been delivered. We hope you love it!\n\n— Team {{store}}', true, 'approved'),
 ('order_delivered', 'Order delivered', 'sms', 'transactional', null,
  'Your {{store}} order {{order_number}} has been delivered. Thank you for shopping with us.', true, 'draft'),
 ('order_delivered', 'Order delivered', 'whatsapp', 'transactional', null,
  'Your {{store}} order {{order_number}} has been delivered. Thank you for shopping with us.', true, 'draft'),
 ('order_cancelled', 'Order cancelled', 'email', 'transactional', 'Order {{order_number}} cancelled',
  E'Hi {{name}},\n\nYour order {{order_number}} has been cancelled. If you paid online, a full refund has been started to your original payment method.\n\n— Team {{store}}', true, 'approved'),
 ('order_cancelled', 'Order cancelled', 'sms', 'transactional', null,
  'Your {{store}} order {{order_number}} has been cancelled. Any payment will be refunded to the original method.', true, 'draft'),
 ('order_cancelled', 'Order cancelled', 'whatsapp', 'transactional', null,
  'Your {{store}} order {{order_number}} has been cancelled. Any payment will be refunded to the original method.', true, 'draft'),
 ('refund_processed', 'Refund processed', 'email', 'transactional', 'Refund processed for order {{order_number}}',
  E'Hi {{name}},\n\nWe have refunded {{refund_amount}} for order {{order_number}}. Your bank may take 5–7 working days to show it.\n\n— Team {{store}}', true, 'approved'),
 ('refund_processed', 'Refund processed', 'sms', 'transactional', null,
  'Refund of {{refund_amount}} for {{store}} order {{order_number}} has been processed. It may take 5-7 working days to reflect.', true, 'draft'),
 ('refund_processed', 'Refund processed', 'whatsapp', 'transactional', null,
  'Refund of {{refund_amount}} for {{store}} order {{order_number}} has been processed. It may take 5-7 working days to reflect.', true, 'draft');

do $$
declare r record;
begin
    for r in select tablename from pg_tables where schemaname = 'shop'
              and tablename in ('message_status_events','message_templates','message_campaigns','messaging_settings') loop
        execute format('alter table shop.%I enable row level security', r.tablename);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

-- =====================================================================
-- First-party, consent-aware storefront analytics.
--
-- * No IP addresses or user agents are stored.
-- * visitor_id / session_id are random IDs from first-party cookies that
--   the storefront sets ONLY after the visitor accepts analytics.
-- * Without consent, only anonymous page views (no IDs) are recorded.
-- =====================================================================

create table shop.analytics_events (
    id            bigint generated always as identity primary key,
    occurred_at   timestamptz not null default now(),
    event         text not null check (event in (
                      'page_view', 'product_view', 'search', 'add_to_cart',
                      'begin_checkout', 'purchase')),
    visitor_id    uuid,
    session_id    uuid,
    path          text not null check (char_length(path) <= 300),
    product_id    uuid,
    search_query  text check (char_length(search_query) <= 100),
    referrer_host text check (char_length(referrer_host) <= 200),
    utm_source    text check (char_length(utm_source) <= 100),
    utm_medium    text check (char_length(utm_medium) <= 100),
    utm_campaign  text check (char_length(utm_campaign) <= 100),
    device        text check (device in ('mobile', 'tablet', 'desktop')),
    country       text check (country ~ '^[A-Z]{2}$'),
    value_paise   integer check (value_paise >= 0),
    check ((visitor_id is null) = (session_id is null))
);
create index analytics_events_time_idx  on shop.analytics_events (occurred_at desc);
create index analytics_events_event_idx on shop.analytics_events (event, occurred_at desc);
create index analytics_events_session_idx on shop.analytics_events (session_id, occurred_at) where session_id is not null;
alter table shop.analytics_events enable row level security;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on shop.analytics_events from anon, authenticated';
    end if;
end;
$$;

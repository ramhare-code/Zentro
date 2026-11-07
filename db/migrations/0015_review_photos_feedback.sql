-- =====================================================================
-- Review photos (moderated with the review) and site feedback.
-- =====================================================================

alter table shop.media_files add column purpose text not null default 'catalogue' check (purpose in ('catalogue', 'review'));

create table shop.review_media (
    id           uuid primary key default gen_random_uuid(),
    review_id    uuid not null references shop.reviews(id) on delete cascade,
    url          text not null,
    storage_key  text,
    width        integer,
    height       integer,
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now()
);
create index review_media_review_idx on shop.review_media (review_id, sort_order);

-- site_feedback existed (unused) since 0001; extend it
alter table shop.site_feedback
    add column kind        text not null default 'other' check (kind in ('problem', 'suggestion', 'praise', 'other')),
    add column email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    add column device      text check (char_length(device) <= 20),
    add column status      text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
    add column staff_note  text check (char_length(staff_note) <= 1000),
    add column handled_by  uuid references shop.staff_users(id) on delete set null,
    add column handled_at  timestamptz,
    alter column message set not null,
    add constraint site_feedback_message_ck check (char_length(message) between 5 and 2000);
create index site_feedback_status_idx on shop.site_feedback (status, created_at desc);

do $$
begin
    execute 'alter table shop.review_media enable row level security';
    execute 'alter table shop.site_feedback enable row level security';
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

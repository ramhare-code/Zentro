-- =====================================================================
-- Richer product pages and a fuller review system.
-- =====================================================================

-- ---- products: detail fields shown on the product page -----------------
-- brand_story: [{ "title", "body", "mediaUrl", "mediaKind": "image"|"video"|"youtube", "posterUrl" }]
alter table shop.products
    add column brand_story       jsonb not null default '[]'::jsonb,
    add column box_contents      text[] not null default '{}',
    add column warranty          text check (char_length(warranty) <= 500),
    add column country_of_origin text check (char_length(country_of_origin) <= 60),
    add column manufacturer_info text check (char_length(manufacturer_info) <= 1000),
    add column care_instructions text check (char_length(care_instructions) <= 1000);
alter table shop.products add constraint products_brand_story_shape
    check (jsonb_typeof(brand_story) = 'array' and jsonb_array_length(brand_story) <= 8);
alter table shop.products add constraint products_box_contents_size
    check (cardinality(box_contents) <= 20);

-- YouTube links are allowed as product videos (rendered as privacy-enhanced embeds).
alter table shop.product_media drop constraint if exists product_media_kind_check;
alter table shop.product_media add constraint product_media_kind_check check (kind in ('image', 'video', 'youtube'));

-- ---- reviews: seller replies and customer reports ----------------------
alter table shop.reviews
    add column seller_reply       text check (char_length(seller_reply) <= 2000),
    add column seller_replied_at  timestamptz,
    add column seller_replied_by  uuid references shop.staff_users(id) on delete set null,
    add column report_count       integer not null default 0;

create table shop.review_reports (
    review_id   uuid not null references shop.reviews(id) on delete cascade,
    reporter    text not null,  -- 'c:<customer id>' or 'v:<hashed visitor id>'
    reason      text not null check (reason in ('spam', 'offensive', 'not_about_product', 'personal_info', 'fake', 'other')),
    created_at  timestamptz not null default now(),
    primary key (review_id, reporter)
);
create index review_reports_recent_idx on shop.review_reports (created_at desc);

-- Helpful votes: one per signed-in customer; the counter is kept by trigger.
create or replace function shop.review_votes_count() returns trigger language plpgsql as $$
begin
    update shop.reviews set helpful_count = (select count(*) from shop.review_votes v where v.review_id = coalesce(new.review_id, old.review_id))
    where id = coalesce(new.review_id, old.review_id);
    return null;
end;
$$;
drop trigger if exists review_votes_count on shop.review_votes;
create trigger review_votes_count after insert or delete on shop.review_votes
    for each row execute function shop.review_votes_count();

create index if not exists reviews_product_rating_idx on shop.reviews (product_id, rating) where status = 'published';

do $$
begin
    execute 'alter table shop.review_reports enable row level security';
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

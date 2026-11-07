-- =====================================================================
-- Content pages (policies, About, etc.) with full version history,
-- and FAQ management. Bodies use a small, safe Markdown subset that
-- is parsed (never injected as HTML) on the storefront.
-- =====================================================================

create table shop.content_pages (
    id                    uuid primary key default gen_random_uuid(),
    slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
    kind                  text not null check (kind in ('policy', 'page')),   -- /policies/<slug> or /pages/<slug>
    seo_title             text check (char_length(seo_title) <= 70),
    seo_description       text check (char_length(seo_description) <= 170),
    show_in_footer        boolean not null default true,
    sort_order            integer not null default 0,
    needs_review          boolean not null default false,   -- draft legal text still to be checked by an adviser
    draft_version_id      uuid,
    published_version_id  uuid,
    published_at          timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

-- every save is a new, immutable version
create table shop.content_page_versions (
    id          uuid primary key default gen_random_uuid(),
    page_id     uuid not null references shop.content_pages(id) on delete cascade,
    version     integer not null,
    title       text not null check (char_length(title) between 2 and 100),
    summary     text check (char_length(summary) <= 300),
    body        text not null check (char_length(body) <= 60000),
    note        text check (char_length(note) <= 200),
    created_by  uuid references shop.staff_users(id) on delete set null,
    created_at  timestamptz not null default now(),
    unique (page_id, version)
);
alter table shop.content_pages
    add constraint content_pages_draft_fk foreign key (draft_version_id) references shop.content_page_versions(id),
    add constraint content_pages_published_fk foreign key (published_version_id) references shop.content_page_versions(id);
create trigger content_pages_touch_updated_at before update on shop.content_pages for each row execute function shop.touch_updated_at();

create or replace function shop.content_versions_immutable() returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' then raise exception 'content versions are immutable'; end if;
    -- deleting is only allowed as part of deleting the whole page
    if not exists (select 1 from shop.content_pages where id = old.page_id) then return old; end if;
    raise exception 'content versions are immutable';
end;
$$;
create trigger content_versions_no_update before update on shop.content_page_versions for each row execute function shop.content_versions_immutable();

-- FAQs: track edits
alter table shop.faqs
    add column updated_at timestamptz not null default now(),
    add column updated_by uuid references shop.staff_users(id) on delete set null,
    add constraint faqs_lengths_ck check (char_length(topic) between 2 and 60 and char_length(question) between 5 and 200 and char_length(answer) between 2 and 4000);
create trigger faqs_touch_updated_at before update on shop.faqs for each row execute function shop.touch_updated_at();

-- seed: the policy text the storefront shipped with (marked for legal review)
create function shop.seed_content_page(p_slug text, p_kind text, p_title text, p_summary text, p_body text, p_sort int)
returns void language plpgsql as $$
declare pid uuid; vid uuid;
begin
    insert into shop.content_pages (slug, kind, sort_order, needs_review) values (p_slug, p_kind, p_sort, true) returning id into pid;
    insert into shop.content_page_versions (page_id, version, title, summary, body, note)
        values (pid, 1, p_title, p_summary, p_body, 'Initial draft text — review before launch') returning id into vid;
    update shop.content_pages set draft_version_id = vid, published_version_id = vid, published_at = now() where id = pid;
end;
$$;
select shop.seed_content_page($c$shipping$c$, 'policy', $c$Shipping & delivery$c$, $c$Where we deliver, delivery charges and timelines.$c$, $c$## Delivery areas

We deliver to serviceable pincodes across India. Enter your pincode at checkout to confirm delivery and see the estimated delivery date.

## Charges

Delivery charges, if any, are calculated from your delivery address and order value, and are shown before you pay.

## Tracking

When your order ships you will receive the carrier name and tracking number by email, and can track it from My Orders.

## Failed delivery

If the carrier cannot deliver after repeated attempts, the order returns to us and we refund the amount paid, minus any non-refundable charges stated at checkout.$c$, 1);
select shop.seed_content_page($c$returns$c$, 'policy', $c$Returns & refunds$c$, $c$How to return a product and when you will receive your refund.$c$, $c$## Return window

Most products can be returned within {returnDays} days of delivery. The product page shows if an item is not returnable (for example, hygiene or personalised products).

## Condition

Items must be unused, in their original packaging, with all tags, accessories and freebies included. Damaged, defective or wrong items can always be returned within the window.

## How to request a return

Open My Orders, select the delivered order and choose Request return. Tell us the reason and, where relevant, add photos. We will confirm pickup or drop-off details.

## Refunds

Once the returned item is received and checked, we issue the refund to your original payment method. You can follow the refund status on the order page. Banks typically take 5–7 working days to credit it.

## Cancellations

You can cancel an order from the order page until it is packed. Prepaid cancellations are refunded in full to the original payment method.$c$, 2);
select shop.seed_content_page($c$privacy$c$, 'policy', $c$Privacy policy$c$, $c$What personal data {business} collects, why, and your rights.$c$, $c$## What we collect

Account details (name, email, phone), delivery addresses, order and payment status, support conversations, and basic technical data needed to run the site securely. Card, UPI and bank details are handled by our payment partner and are never stored by us.

## Why we use it

To process and deliver orders, provide customer support, prevent fraud, meet tax and legal obligations, and — only if you opt in — to send offers.

## Sharing

We share only what is necessary with service providers who help us operate: payment processing, delivery partners, email/SMS delivery and hosting. We do not sell personal data.

## Cookies and analytics

Essential cookies keep your cart and sign-in working. With your permission we also set a first-party analytics cookie (a random ID) to count visits and understand which pages are useful. We don’t store your IP address for analytics, and the data is never shared with advertisers. You can change your choice any time with “Cookie settings” at the bottom of every page. Analytics data is deleted after 13 months.

## Retention

We keep order and invoice records for as long as tax law requires. Other data is deleted when no longer needed or when you delete your account.

## Your rights

You can access and correct your information from your account, withdraw marketing consent at any time, and delete your account. For any privacy request contact {email}.$c$, 3);
select shop.seed_content_page($c$terms$c$, 'policy', $c$Terms of use$c$, $c$The terms that apply when you shop with {business}.$c$, $c$## Orders

An order is confirmed only after payment is successfully verified. We may cancel an order and refund in full if a product is unavailable, mispriced due to an obvious error, or the order appears fraudulent.

## Prices

Prices are in Indian Rupees and include applicable GST. Delivery charges and any discounts are shown at checkout before payment.

## Product information

We take care to describe products accurately. Colours may vary slightly by screen. If an item is not as described you may return it under our returns policy.

## Accounts

Keep your login details confidential. You are responsible for activity on your account. You may delete your account at any time.

## Reviews

Reviews may be posted only by customers who bought the product. Reviews are moderated for abuse and spam; we never edit ratings or remove genuine negative reviews.

## Contact

Questions about these terms can be sent to {email}.$c$, 4);
drop function shop.seed_content_page(text, text, text, text, text, int);

do $$
begin
    execute 'alter table shop.content_pages enable row level security';
    execute 'alter table shop.content_page_versions enable row level security';
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema shop from anon, authenticated';
    end if;
end;
$$;

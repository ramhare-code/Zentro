# Zentro — architecture

## Stack

| Concern | Choice | Why |
|---|---|---|
| Web framework | **Next.js 16 (App Router) + React 19 + TypeScript** | Server components keep database access and secrets on the server; built-in ISR caching, image optimisation, metadata/SEO APIs. |
| Styling | **Tailwind CSS v4** with design tokens in `src/app/globals.css` | One source of truth for colour, type, radius and shadow; tokens are contrast-checked for WCAG 2.2 AA. |
| Database | **PostgreSQL (Supabase)** | Transactional, row locks for inventory, full-text + trigram search built in. |
| Data access | **`postgres` (porsager) with hand-written, parameterised SQL** | Checkout needs explicit `SELECT … FOR UPDATE` locking and idempotency; plain SQL keeps those guarantees visible and reviewable. Every value is a bound parameter, so SQL injection is not possible through the query builder. |
| Migrations | Plain SQL in `db/migrations`, applied by `scripts/migrate.mjs` | Ordered, tracked in `shop.schema_migrations`, each file in its own transaction. Same files can be applied through the Supabase dashboard or CLI. |
| Auth (Phase 3) | **Supabase Auth** | Email verification, password reset, phone OTP via a licensed SMS provider, session refresh — no passwords stored by us. |
| Payments (Phase 4) | **Razorpay** | UPI, cards, net banking and wallets for Indian businesses; server-side signature + webhook verification. |
| Media | **Supabase Storage** (public bucket for product media, private bucket for review images) | Object storage on the same project; served via Next image optimisation. |
| Hosting | **Vercel** | Preview deployments = staging, production branch = production, each with its own env vars. |
| Tests | **Vitest** (unit), **Playwright** (end-to-end, desktop + mobile) | |

## Security model

* All commerce tables live in the private **`shop`** schema. Supabase only exposes the `public`
  schema through its REST/GraphQL Data API, so the browser's anon key **cannot reach any shop
  data**. RLS is still enabled on every table with no policies, as defence in depth.
* Only the Next.js server talks to the database, via `DATABASE_URL` (Supabase transaction pooler).
* There are **no management/admin endpoints**. Products, stock and order fulfilment are managed
  through authorised operational processes — see `docs/OPERATIONS.md`.
* User input is validated twice: on the client for UX and on the server with Zod plus database
  `CHECK` constraints.
* Prices, discounts, taxes and totals are always computed on the server from database values,
  never trusted from the browser.
* Money is stored as integer **paise**.

## Data model (db/migrations/0001_core_schema.sql)

Catalogue: `categories` (tree), `brands`, `products`, `product_media` (images + videos),
`product_variants` (options such as colour/size/capacity, price, MRP, stock), `banners`.
Views: `product_listing` (price range, stock, primary image), `search_vocabulary` (spelling
suggestions).

Customers: `profiles`, `addresses` (keyed to `auth.users`). Shopping: `carts` (user or guest
token), `cart_items`, `wishlist_items`. Pricing: `coupons`, `shipping_rates`,
`unserviceable_pincodes`.

Orders: `orders` (snapshot of address + totals, idempotency key, guest access hash),
`order_items` (price/tax snapshot incl. CGST/SGST/IGST split), `order_events` (status history),
`inventory_reservations` (stock held during payment), `payments`, `payment_webhook_events`
(unique event id ⇒ idempotent webhooks), `shipments`, `shipment_events`, `invoices`.

After-sales: `return_requests`, `return_items`, `refunds`, `reviews` (one per purchased order
item, moderated), `review_images`, `review_votes`. Product ratings are maintained by a trigger
from **published** reviews only — application code cannot write them.

Support: `faqs`, `support_tickets`, `ticket_messages`, `site_feedback`.
Platform: `notification_outbox` (email/SMS written in the same transaction as the business
change), `rate_limits` + `rate_limit_hit()`, `account_deletions`.

## Search

* Prefix full-text search over a weighted `tsvector` (name > short description > description),
  plus brand/category names.
* Typo tolerance with `pg_trgm` `word_similarity` on product names.
* "Did you mean…?" built from the catalogue's own vocabulary with trigram similarity.
* Facets (brand counts, price bounds) are computed within the current category/query scope.
* Move to Meilisearch/Typesense when the catalogue outgrows Postgres search (tens of thousands
  of products or heavy query volume).

## Caching

Homepage, category tree and product pages use ISR (`revalidate = 300`). Search and filtered
listings are rendered on demand. Autocomplete responses are CDN-cached for 60 s.

## Build phases

1. ✅ Project, architecture, database, design system, homepage
2. ✅ Categories, listings, search, filters, sorting, product detail pages
3. ⏳ Accounts (Supabase Auth), profiles, addresses, cart, wishlist
4. ⏳ Checkout, Razorpay payment verification, order creation, inventory integrity
5. ⏳ Tracking, cancellations, returns, refunds, reviews, notifications, support tickets
6. ⏳ Hardening (CSP, rate limits), performance, SEO, accessibility audit, CI, monitoring, launch

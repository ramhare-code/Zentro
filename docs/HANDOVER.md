# Zentro — handover to the new owner

Welcome. This document is for whoever takes over the Zentro store. It explains what exists, what you now own, and exactly what to do to launch.

## 1. What you're getting

Two websites that share one database:

| | What it is | Code |
|---|---|---|
| **Storefront** | The shop customers use: catalogue, search, cart, checkout (Razorpay), order tracking, returns, reviews with photos, wishlist, accounts, help centre, support tickets, feedback | `apps/storefront` |
| **Admin** | Your back office, on its own domain: products, stock, suppliers and purchase orders, orders and shipping labels, payments and reconciliation, profit and GST reports, coupons, promotions, banners, pages and policies, customer messaging (email/SMS/WhatsApp), visitor and sales analytics, staff and permissions, audit log, settings, system status | `apps/admin` |

Everything is built and tested (unit tests plus 100+ browser tests, including accessibility checks). Nothing is live yet.

## 2. Transfer these to yourself first

The previous owner's accounts hold these. Ask them to transfer each one to you (or add you as owner), then remove their access:

1. **GitHub repository** `ramhare-code/Zentro` — Settings → Transfer ownership (or add you as admin). All the code lives here; the latest work is on branch `ccr-658a074d-fu5qz1` — merge it into `main`.
2. **Supabase project** `kupvbrtpikjzdbjzlmdm` — Organization settings → invite you as Owner. The store's database is already set up in it (all 16 migrations applied and verified). It's empty: no products, orders or staff yet.
   *Note:* this project also contains two unrelated tables (`public.location_updates`, `public.tracking_invites`) from another app. Zentro never touches them. If they aren't yours, either leave them or ask for Zentro to be moved to a fresh project (re-run `scripts/migrate.mjs` there).
3. **Domain name**, if one was bought — transfer at the registrar.

Change any shared passwords and rotate any keys the previous owner had access to.

## 3. Accounts you need to open (in your business's name)

These must be in the name of the business that sells — they involve KYC and legal registration, so nobody can do them for you.

| Account | Why | Time |
|---|---|---|
| **Razorpay** | Takes payments (UPI, cards, net banking, wallets) | KYC 2–5 days |
| **Vercel** | Hosts both websites | Minutes |
| **Resend** | Order and account emails (verify your domain) | Same day |
| **MSG91 + DLT registration** | SMS (legally required registration in India) | 1–2 weeks — start early |
| WhatsApp Business (Meta) — optional | WhatsApp order updates and offers | Days; templates need approval |
| Shiprocket — optional | Book couriers and track parcels automatically | Same day |

## 4. Decisions to make before launch

- **Products:** names, categories, prices, MRP, stock, photos (≥ 800×800), **HSN code and GST rate** for each — confirm with your accountant.
- **GST on shipping:** whether delivery charges include GST (one switch in Admin → Settings → Tax) — your accountant decides.
- **Shipping:** where you deliver, the charge, the free-delivery threshold and delivery times.
- **Returns:** the return window and which items can't be returned.
- **Legal:** have the four policies (Shipping, Returns, Privacy, Terms — starter text is already in the system) reviewed by a legal adviser.
- **Business details:** legal name, registered address, GSTIN, state, support email and phone, and a **grievance officer** (required by Indian e-commerce rules).

## 5. Going live — step by step

Follow **`docs/DEPLOYMENT.md`** (every setting is listed there). In short:

1. Create two Vercel projects from the repository (roots `apps/storefront` and `apps/admin`), add your domains, set the environment variables.
2. Create your owner login:
   `DATABASE_URL=… ADMIN_URL=https://admin.yourstore.in node scripts/create-owner.mjs --email you@… --name "Your Name"` — open the link, set a password and two-step verification.
3. In the admin: Settings (business details, shipping, tax) → add products (one by one or CSV import) → publish the reviewed policies.
4. Connect Razorpay, email and SMS (keys go into Vercel's environment settings, never into chat or code).
5. Place one real ₹1 order and refund it.
6. Tick off the launch checklist at the end of `docs/DEPLOYMENT.md`.

## 6. Day-to-day

- **Running the store:** `docs/OPERATIONS.md` (adding products, stock, orders, refunds, payments, finance, promotions, courier, pages).
- **Admin features and security:** `docs/ADMIN.md`. **Messaging rules** (consent, DLT, quiet hours): `docs/MESSAGING.md`.
- **Is everything working?** Admin → Settings → System status. Point an uptime monitor at `/api/health` on both sites.
- **Backups:** Supabase backs up daily; for your own copy use `scripts/backup.sh`, and test it monthly with `scripts/restore-check.sh`.
- **Staff:** invite them from Admin → Staff with the least access they need (Manager, Inventory, Support, Finance). Everyone must use two-step verification; every action is in the audit log.

## 7. Things to know

- The store **never invents data**: no fake reviews, orders or business details. Blank settings stay hidden until you fill them in.
- Courier (Shiprocket) and settlement-report import were tested against local stand-ins of those services — test them with your real accounts before relying on them.
- Keep `ADMIN_ENCRYPTION_KEY` safe (password manager). Without it, staff must set up two-step verification again.
- For a developer: `README.md` explains how to run and test everything locally (`npm test`, Playwright suites in each app).

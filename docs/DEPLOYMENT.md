# Deploying Zentro

Two Next.js apps share one PostgreSQL database (Supabase):

| App | Folder | Suggested domain | Who uses it |
|---|---|---|---|
| Storefront | `apps/storefront` | `www.yourstore.in` | Customers |
| Admin | `apps/admin` | `admin.yourstore.in` | You and your staff |

The steps below use **Supabase** (database + file storage) and **Vercel** (hosting). Other hosts work the same way: build each app with `npm run build -w @zentro/<app>` and run `npm start -w @zentro/<app>`.

---

## 1. Database (Supabase)

1. Create a project in the **Mumbai (ap-south-1)** region (customer data stays in India, lowest latency).
2. In *Project settings → Database*, copy the **direct connection** string (port 5432) for migrations, and the **transaction pooler** string (port 6543) for the apps.
3. Apply the schema from your computer (never the dev seed):
   ```bash
   DATABASE_URL="<direct connection string>" node scripts/migrate.mjs
   ```
   It creates everything in a private `shop` schema (row-level security on, no access for Supabase's public API roles) and records each migration in `shop.schema_migrations`. It is safe to re-run; only new migrations are applied. It does not touch other tables in your project.
4. Create the first owner account:
   ```bash
   DATABASE_URL="<direct>" ADMIN_URL="https://admin.yourstore.in" node scripts/create-owner.mjs --email you@yourstore.in --name "Your Name"
   ```
   Open the printed invite link to set a password and two-step verification.
5. **Storage** for product, banner and review images: create a **public** bucket named `product-media`, then set `MEDIA_STORAGE=supabase`, `MEDIA_BUCKET=product-media`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on both apps. (Without this, images are stored in the database — fine for testing, not for a busy store.)

## 2. Hosting (Vercel)

Create **two** Vercel projects from the same repository:

| Setting | Storefront | Admin |
|---|---|---|
| Root directory | `apps/storefront` | `apps/admin` |
| Framework | Next.js | Next.js |
| Install command | `npm ci` (run at repo root — Vercel does this for workspaces) | same |
| Region | Mumbai (`bom1`) | Mumbai (`bom1`) |

Add the domains, then set the environment variables below **for Production only** (use separate test keys in Preview).

### Environment variables

Generate each secret with `openssl rand -base64 32`. Values marked **both** must be identical on the two projects.

| Variable | Storefront | Admin | Notes |
|---|---|---|---|
| `APP_ENV` | `production` | `production` | |
| `DATABASE_URL` | ✓ | ✓ | pooler string (port 6543) |
| `NEXT_PUBLIC_SITE_URL` | `https://www.yourstore.in` | | |
| `ADMIN_URL` / `STOREFRONT_URL` | | ✓ / ✓ | |
| `ADMIN_ENCRYPTION_KEY` | | ✓ | 32 random bytes, base64. **Back it up** — staff two-step secrets can't be read without it |
| `CRON_SECRET` | ✓ | | Vercel sends it to the 5-minute job |
| `REVALIDATE_SECRET` | both | both | admin refreshes storefront pages |
| `UNSUBSCRIBE_SECRET` | both | both | signed unsubscribe links |
| `TICKET_LINK_SECRET` | both | both | support ticket links |
| `HEALTH_CHECK_TOKEN` | both | both | detailed `/api/health` and the System status page |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | ✓ | ✓ | live keys after KYC |
| `RAZORPAY_WEBHOOK_SECRET` | ✓ | | |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✓ | ✓ | |
| `MSG91_AUTH_KEY` | ✓ | ✓ | DLT registration required for SMS in India |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | ✓ | ✓ | `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` on the storefront for delivery receipts |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION` | ✓ | ✓ | optional courier booking |
| `SHIPROCKET_WEBHOOK_TOKEN` | ✓ | | |
| `MEDIA_STORAGE`, `MEDIA_BUCKET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | step 1.5 |
| `ALERT_WEBHOOK_URL` | ✓ | ✓ | optional Slack/Discord/Chat webhook |

Business details (legal name, GSTIN, state, support contacts, grievance officer, return window) are entered in **Admin → Settings** after launch. The `BUSINESS_*`, `SUPPORT_*`, `SELLER_STATE_CODE` and `RETURN_WINDOW_DAYS` variables are only fallbacks.

## 3. Scheduled job

`apps/storefront/vercel.json` runs `/api/cron/maintenance` every 5 minutes. It confirms payments whose callback was missed, releases expired stock holds, sends queued messages, starts scheduled campaigns, syncs courier tracking and refreshes cached pages when promotions start or end.

* Vercel **Hobby** plans only allow daily cron jobs. On Hobby, use an external scheduler (for example cron-job.org or a GitHub Actions schedule) to call
  `GET https://www.yourstore.in/api/cron/maintenance` with header `Authorization: Bearer <CRON_SECRET>` every 5 minutes.
* **Admin → Settings → System status** shows every run; it turns amber if the job hasn't run for 15 minutes.

## 4. Webhooks

| Service | URL | Secret |
|---|---|---|
| Razorpay | `https://www.yourstore.in/api/webhooks/razorpay` (events: payment.captured, payment.failed, order.paid, refund.processed, refund.failed) | `RAZORPAY_WEBHOOK_SECRET` |
| Resend | `https://www.yourstore.in/api/webhooks/resend` | `RESEND_WEBHOOK_SECRET` |
| MSG91 | `https://www.yourstore.in/api/webhooks/msg91` | `MSG91_WEBHOOK_TOKEN` |
| WhatsApp | `https://www.yourstore.in/api/webhooks/whatsapp` | `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` |
| Shiprocket | `https://www.yourstore.in/api/webhooks/courier` | `SHIPROCKET_WEBHOOK_TOKEN` (as the `x-api-key`) |

## 5. Monitoring

* **Uptime:** point an uptime monitor (UptimeRobot, Better Stack…) at `https://www.yourstore.in/api/health` and `https://admin.yourstore.in/api/health`. They return `{"status":"ok"}` (HTTP 200) or 503 when the database is unreachable. With `Authorization: Bearer <HEALTH_CHECK_TOKEN>` they also report migrations and integration status (never secret values).
* **Errors and failed jobs:** set `ALERT_WEBHOOK_URL` to an incoming-webhook URL. Unhandled server errors and failed scheduled jobs are posted there (message, route and error digest only — no customer data), at most once per message every 10 minutes. Every error is also written to the server log as one JSON line (Vercel → Logs).
* **Business alerts** (low stock, failed payments, overdue purchase orders, delivery problems, website problem reports) appear in the admin's bell menu.

## 6. Backups

* **Supabase** backs up daily; paid plans add point-in-time recovery. Enable it before launch.
* **Independent copy:** run `scripts/backup.sh` daily from a trusted machine or CI job:
  ```bash
  DATABASE_URL="<direct>" BACKUP_DIR=/secure/backups BACKUP_GPG_RECIPIENT=you@yourstore.in scripts/backup.sh
  ```
  It dumps the `shop` schema, checks the archive is readable, encrypts it with your GPG key, writes a checksum and deletes copies older than `BACKUP_KEEP_DAYS` (30). Backups contain customer personal data — keep them encrypted and private.
* **Test restores monthly:** `scripts/restore-check.sh /secure/backups/zentro-shop-<date>.dump.gpg` restores into a throw-away local database, prints row counts, verifies the tamper-evident audit-log chain, then deletes the copy.
* Keep `ADMIN_ENCRYPTION_KEY` in your password manager: a restored database without it means every staff member must set up two-step verification again.

## 7. Security notes

* Both apps send strict security headers. The admin uses a per-request nonce Content-Security-Policy (only its own scripts can run); the storefront's policy only allows its own scripts and Razorpay Checkout, and blocks framing, plugins and foreign form targets.
* The admin is `noindex`, uses 30-minute idle / 12-hour absolute sessions, mandatory two-step verification and re-authentication for sensitive actions. Consider restricting `admin.yourstore.in` by IP or putting it behind Vercel's password protection as an extra layer.
* `/.well-known/security.txt` tells researchers how to reach you (uses your support email).
* Rotate a secret by setting the new value on both projects and redeploying; rotating `UNSUBSCRIBE_SECRET` or `TICKET_LINK_SECRET` invalidates links already sent.

## 8. Launch checklist

- [ ] Migrations applied to Supabase; `/api/health` with the token shows *migrations up to date* on both apps
- [ ] Owner account created; every staff member has two-step verification
- [ ] Admin → Settings: legal name, address, GSTIN, state, support email/phone, grievance officer, return window
- [ ] Admin → Settings → Shipping: rates cover every state you deliver to (use the coverage check)
- [ ] Admin → Settings → Tax: HSN codes for every product; decision on GST for shipping confirmed with your accountant
- [ ] Policies reviewed by a legal adviser and published with “reviewed” ticked
- [ ] Razorpay live keys + webhook; one real ₹1 test order paid and refunded
- [ ] Email domain verified in Resend; SMS DLT templates approved; WhatsApp templates approved
- [ ] Cron running (System status), uptime monitor and alert webhook set up
- [ ] Supabase backups/PITR on; first `restore-check.sh` passed
- [ ] `db/seed/dev_seed.sql` **not** loaded in production

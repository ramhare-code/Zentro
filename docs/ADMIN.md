# Zentro Admin

A separate Next.js app (`apps/admin`) for running the store. It shares the
storefront's PostgreSQL database (`shop` schema) through `@zentro/commerce`, so
there is exactly one catalogue, one inventory and one order ledger.

## Security model

| Control | Implementation |
|---|---|
| Separate identities | Staff live in `shop.staff_users`, never in customer `auth.users`. No public sign-up: the first Owner is created with `npm run admin:create-owner`; everyone else is invited by an Owner. |
| Passwords | scrypt (N=2¹⁵, r=8, p=1), min 12 chars; constant-time verification with a dummy hash for unknown emails. |
| MFA (mandatory) | RFC 6238 TOTP (any authenticator app), secrets encrypted at rest with AES-256-GCM (`ADMIN_ENCRYPTION_KEY`), replay protection (each 30 s code works once), 10 single-use recovery codes stored as SHA-256 hashes. An account cannot become `active` without MFA (DB constraint). |
| Brute force | Per-IP and per-email rate limits; account locks for 15 min after 5 wrong passwords; MFA challenge allows 5 attempts and expires in 5 min. |
| Sessions | Random 256-bit token in an `httpOnly`, `Secure`, `SameSite=Strict`, `__Host-` cookie; only its hash is stored. 30 min idle timeout, 12 h absolute. Revoked on sign-out, role change, disable or access reset; users can sign out other devices. |
| Step-up auth | Staff/role changes require an MFA code from the last 10 minutes (`authorize(p, { recentAuth: true })`). Refunds and other money movements will use the same guard. |
| Authorisation | Every page calls `requirePermission()` and every server action calls `authorize()` — both re-read the session and role from the database. Hiding a menu item is never the control. The proxy redirect is only a convenience. |
| Least privilege | 5 built-in roles (Owner, Manager, Inventory, Support, Finance) + custom roles. Staff/role/settings/messaging-provider permissions are Owner-only. The last active Owner can't be demoted or disabled. |
| PII | Customer emails/phones are masked unless the role has `customers.pii`. Financial KPIs need `finance.read`/`analytics.read`. |
| Audit log | `shop.audit_log` is append-only (UPDATE/DELETE/TRUNCATE raise) and hash-chained; *Audit log → Verify integrity* recomputes the chain. Sign-ins, failures, staff and role changes are logged with IP and user agent. |
| CSRF | Next.js server actions verify the `Origin` header; cookies are `SameSite=Strict`. |
| Headers | HSTS, `X-Frame-Options: DENY`, `noindex`, `no-store`, `Referrer-Policy: no-referrer`, COOP. Robots disallowed. |

## First run

```bash
# 1. database (shared with the storefront)
npm run db:migrate

# 2. admin env
cp apps/admin/.env.example apps/admin/.env.local   # set ADMIN_ENCRYPTION_KEY

# 3. create the Owner and open the printed link
DATABASE_URL=... ADMIN_URL=http://localhost:3001 \
  npm run admin:create-owner -- --email you@yourstore.in --name "Your Name"

npm run dev:admin   # http://localhost:3001
```

Until an email provider is connected, invitation links are shown once to the inviting
Owner to pass on privately (e.g. in person or an encrypted chat).

## Deploying

* Create a **second Vercel project** with root directory `apps/admin`, on its own
  domain (e.g. `admin.yourstore.in`). Set `APP_ENV=production`, `ADMIN_URL=https://…`,
  the same `DATABASE_URL` as the storefront, and a unique `ADMIN_ENCRYPTION_KEY`
  (losing it means every staff member must re-enrol MFA).
* Recommended extra layer: Vercel Deployment Protection / Cloudflare Access or an IP
  allow-list in front of the admin domain.

## Testing

```bash
cd apps/admin
npm test                         # unit: TOTP RFC vectors, scrypt, AES-GCM, masking, permissions
npx next build && npm run test:e2e   # fresh DB → owner bootstrap → MFA login → roles → audit
```

## Build status (120 requirements)

| Area | Status |
|---|---|
| Foundation — auth + MFA, RBAC, staff, audit log, dashboard, search, alerts (#1–10, 91–95) | **Done** |
| Visitor analytics — live visitors, page views, sessions, funnel, sources, devices (#81, 84–86 partly) | **Done** |
| Orders — list, filters, detail, validated status flow, shipping + tracking, cancel + Razorpay refund, notes, audit (#41–45, 47–50, 65–66 partly) | **Done** |
| Customer messaging — templates, one-to-one, campaigns, scheduling, approval, consent ledger, unsubscribe, delivery reports, costs, analytics (#101–120) | **Done** (needs provider accounts, see `docs/MESSAGING.md`) |
| Catalogue management (#11–30) | Next |
| Inventory, suppliers, purchase orders (#31–40) | Planned |
| Customers directory & privacy requests (#51–60) | Planned (needs customer accounts on the storefront) |
| Payments dashboard, reconciliation, finance reports, invoices, tax rules (#61–64, 67–70) | Planned |
| Coupons, promotions, banners, content (#71–80), support tickets, review moderation (#88–89) | Planned |
| Hardening & deployment (#96–100) | Planned |

Dashboard figures are computed from real tables. "Net revenue" = paid orders in
the period minus refunds processed in the period; it will read ₹0 until real orders exist.

# Zentro

A production-oriented e-commerce platform: Next.js 16 + TypeScript + Tailwind CSS +
PostgreSQL (Supabase), as an npm-workspaces monorepo:

| Path | What |
|---|---|
| `apps/storefront` | Customer shopping website |
| `apps/admin` | Staff administration website (separate domain) — see `docs/ADMIN.md` |
| `packages/commerce` | Shared domain logic: money, stock, order lifecycle, DB pool |
| `db/migrations` | One shared PostgreSQL schema (`shop`) |

See `docs/ARCHITECTURE.md` for design decisions and `docs/OPERATIONS.md` for running the store.

The previous single-file prototype is kept in `legacy/index.html` for reference.

## Run locally

Requirements: Node 20.9+, PostgreSQL 15+ (or a Supabase project).

```bash
npm install
cp apps/storefront/.env.example apps/storefront/.env.local   # then edit values

# local Postgres only: create stand-ins for Supabase's auth schema
psql "$DATABASE_URL" -f db/test/supabase_shim.sql

npm run db:migrate                   # apply schema
npm run db:seed:dev                  # sample catalogue (development/staging only)
npm run dev:store                    # http://localhost:3000
npm run dev:admin                    # http://localhost:3001 (see docs/ADMIN.md)
```

## Test

```bash
npm run typecheck                    # both apps
npm test                             # unit tests (Vitest), both apps
npm run build                        # both apps
(cd apps/storefront && npm run test:e2e)   # storefront, desktop + mobile
(cd apps/admin && npm run test:e2e)        # admin auth/RBAC/audit on a fresh DB
```

## Deploy (Vercel + Supabase)

1. Create the database schema: run `db/migrations/*.sql` in order (Supabase SQL editor, or
   `DATABASE_URL=<pooler url> npm run db:migrate`). Do **not** run the shim or dev seed on production.
2. Import the GitHub repo in Vercel twice: root `apps/storefront` (shop domain) and
   root `apps/admin` (admin domain). Set the variables from `.env.example` separately for
   **Preview** (staging, `APP_ENV=staging`, Razorpay test keys) and **Production**
   (`APP_ENV=production`, live keys).
3. Add your domain in Vercel; HTTPS certificates are issued automatically. HSTS is enabled.

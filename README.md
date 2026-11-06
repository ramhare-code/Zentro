# Zentro

A production-oriented e-commerce storefront: Next.js 16 + TypeScript + Tailwind CSS +
PostgreSQL (Supabase). See `docs/ARCHITECTURE.md` for design decisions and build phases, and
`docs/OPERATIONS.md` for running the store.

The previous single-file prototype is kept in `legacy/index.html` for reference.

## Run locally

Requirements: Node 20.9+, PostgreSQL 15+ (or a Supabase project).

```bash
npm install
cp .env.example .env.local           # then edit values

# local Postgres only: create stand-ins for Supabase's auth schema
psql "$DATABASE_URL" -f db/test/supabase_shim.sql

npm run db:migrate                   # apply schema
npm run db:seed:dev                  # sample catalogue (development/staging only)
npm run dev                          # http://localhost:3000
```

## Test

```bash
npm run typecheck
npm test                             # unit tests (Vitest)
npm run build && npm run test:e2e    # end-to-end on desktop + mobile (Playwright)
```

## Deploy (Vercel + Supabase)

1. Create the database schema: run `db/migrations/*.sql` in order (Supabase SQL editor, or
   `DATABASE_URL=<pooler url> npm run db:migrate`). Do **not** run the shim or dev seed on production.
2. Import the GitHub repo in Vercel. Set the variables from `.env.example` separately for
   **Preview** (staging, `APP_ENV=staging`, Razorpay test keys) and **Production**
   (`APP_ENV=production`, live keys).
3. Add your domain in Vercel; HTTPS certificates are issued automatically. HSTS is enabled.

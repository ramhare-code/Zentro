import postgres from "postgres";
import { waitUntil } from "@vercel/functions";

export type Sql = postgres.Sql<Record<string, never>>;
export type TransactionSql = postgres.TransactionSql<Record<string, never>>;

const globalForDb = globalThis as unknown as { __zentroSql?: Map<string, Sql> };

// On Vercel, a function instance is frozen between requests. Connections left
// open across a freeze die silently and the next query waits forever (pages hung
// until the 300 s limit). So on Vercel idle connections close after 2 s, and each
// request keeps the instance awake just long enough for that to happen before it
// is frozen — the same approach as @vercel/functions' attachDatabasePool.
const onVercel = !!process.env.VERCEL_REGION;
const IDLE_SECONDS = onVercel ? 2 : 20;
let release: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null;

function holdUntilIdleClosed() {
  if (!onVercel) return;
  if (release) { clearTimeout(release.timer); release.resolve(); }
  let resolve!: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  release = { timer: setTimeout(() => { release = null; resolve(); }, IDLE_SECONDS * 1000 + 250), resolve };
  try { waitUntil(done); } catch { /* outside a request (build, scripts) */ }
}

/**
 * One shared connection pool per process and URL. Both the storefront and
 * the admin app use the same Postgres database (schema `shop`), so there is
 * exactly one inventory and one order ledger.
 */
export function getSql(url: string, opts: { max?: number } = {}): Sql {
  globalForDb.__zentroSql ??= new Map();
  let sql = globalForDb.__zentroSql.get(url);
  if (!sql) {
    sql = postgres(url, {
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      max: opts.max ?? (process.env.NODE_ENV === "production" ? 5 : 3),
      idle_timeout: IDLE_SECONDS,
      max_lifetime: 60 * 5,
      connect_timeout: 10,
      onnotice: () => {},
    }) as Sql;
    globalForDb.__zentroSql.set(url, sql);
  }
  holdUntilIdleClosed();
  return sql;
}

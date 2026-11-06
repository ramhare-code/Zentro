import postgres from "postgres";

export type Sql = postgres.Sql<Record<string, never>>;
export type TransactionSql = postgres.TransactionSql<Record<string, never>>;

const globalForDb = globalThis as unknown as { __zentroSql?: Map<string, Sql> };

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
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    }) as Sql;
    globalForDb.__zentroSql.set(url, sql);
  }
  return sql;
}

import "server-only";
import postgres from "postgres";
import { serverEnv } from "./env";

type Sql = postgres.Sql<Record<string, never>>;
const globalForDb = globalThis as unknown as { __zentroSql?: Sql };

function create(): Sql {
  return postgres(serverEnv().DATABASE_URL, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 5 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  }) as Sql;
}

/** Lazily-created shared connection pool (server only). */
export function db(): Sql {
  if (!globalForDb.__zentroSql) globalForDb.__zentroSql = create();
  return globalForDb.__zentroSql;
}

import "server-only";
import { getSql, type Sql } from "@zentro/commerce/db";
import { serverEnv } from "./env";

/** Shared connection pool (server only). */
export function db(): Sql {
  return getSql(serverEnv().DATABASE_URL);
}

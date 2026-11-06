import "server-only";
import { getSql, type Sql } from "@zentro/commerce/db";
import { adminEnv } from "./env";

export function db(): Sql {
  return getSql(adminEnv().DATABASE_URL);
}

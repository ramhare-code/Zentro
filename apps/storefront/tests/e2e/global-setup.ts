import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://zentro:zentro@localhost/zentro_store_e2e";

/** Fresh database per run: Supabase shim + all migrations + dev seed. */
export default async function globalSetup() {
  const url = new URL(E2E_DB);
  const admin = postgres({ host: url.hostname, port: Number(url.port || 5432), username: url.username, password: decodeURIComponent(url.password), database: "postgres", max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${url.pathname.slice(1)} with (force)`);
  await admin.unsafe(`create database ${url.pathname.slice(1)}`);
  await admin.end();
  const root = path.resolve(import.meta.dirname, "../../../..");
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  await sql.unsafe(readFileSync(path.join(root, "db/test/supabase_shim.sql"), "utf8"));
  for (const f of readdirSync(path.join(root, "db/migrations")).sort()) await sql.unsafe(readFileSync(path.join(root, "db/migrations", f), "utf8"));
  await sql.unsafe(readFileSync(path.join(root, "db/seed/dev_seed.sql"), "utf8"));
  await sql.end();
}

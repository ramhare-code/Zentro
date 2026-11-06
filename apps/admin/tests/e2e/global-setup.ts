import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";

/** Fresh database for every run: Supabase shim + all migrations + dev seed. */
export default async function globalSetup() {
  const url = new URL(E2E_DB);
  const name = url.pathname.slice(1);
  const admin = postgres({ ...parse(url), database: "postgres", max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.unsafe(`create database ${name}`);
  await admin.end();

  const root = path.resolve(import.meta.dirname, "../../../..");
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  await sql.unsafe(readFileSync(path.join(root, "db/test/supabase_shim.sql"), "utf8"));
  for (const f of readdirSync(path.join(root, "db/migrations")).sort()) {
    await sql.unsafe(readFileSync(path.join(root, "db/migrations", f), "utf8"));
  }
  await sql.unsafe(readFileSync(path.join(root, "db/seed/dev_seed.sql"), "utf8"));
  await sql.end();
}

function parse(u: URL) {
  return { host: u.hostname, port: Number(u.port || 5432), username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

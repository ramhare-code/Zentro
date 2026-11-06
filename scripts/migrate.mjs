// Applies db/migrations/*.sql in filename order, once each, inside a
// transaction per file. Usage:
//   DATABASE_URL=... node scripts/migrate.mjs            # migrations only
//   DATABASE_URL=... node scripts/migrate.mjs --seed-dev # + development seed
// Never run --seed-dev against production: it inserts sample catalog data.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const seedDev = process.argv.includes("--seed-dev");
if (seedDev && process.env.APP_ENV === "production") {
  console.error("Refusing to load development seed data when APP_ENV=production.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const root = path.dirname(new URL(import.meta.url).pathname);

try {
  await sql`create schema if not exists shop`;
  await sql`create table if not exists shop.schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`;

  const dir = path.join(root, "..", "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await sql`select name from shop.schema_migrations`).map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into shop.schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }

  if (seedDev) {
    const seed = await readFile(path.join(root, "..", "db", "seed", "dev_seed.sql"), "utf8");
    await sql.begin((tx) => tx.unsafe(seed));
    console.log("loaded development seed");
  }
  console.log("database is up to date");
} finally {
  await sql.end();
}

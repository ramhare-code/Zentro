// Health checks, job-run logging and error alerts. Server-side only.
import type { Sql } from "./db";

export const LATEST_MIGRATION = "0018_remember_device.sql";

export interface Health { ok: boolean; db: { ok: boolean; latencyMs: number | null; migration: string | null; upToDate: boolean }; checks: Record<string, string> }

export async function checkHealth(sql: Sql, extra: () => Promise<Record<string, string>> = async () => ({})): Promise<Health> {
  const t = Date.now();
  try {
    await sql`select 1`;
  } catch {
    return { ok: false, db: { ok: false, latencyMs: null, migration: null, upToDate: false }, checks: {} };
  }
  const latency = Date.now() - t;
  // databases built without the migration runner (e.g. test fixtures) have no tracking table
  const [m] = await sql<{ name: string | null }[]>`
    select case when to_regclass('shop.schema_migrations') is null then null else (select max(name) from shop.schema_migrations) end as name`.catch(() => [{ name: null }]);
  const migration = m?.name ?? null;
  const checks = await extra().catch((e) => ({ extra: `error: ${(e as Error).message}` }));
  return { ok: migration === LATEST_MIGRATION, db: { ok: true, latencyMs: latency, migration, upToDate: migration === LATEST_MIGRATION }, checks };
}

/** Runs a job and records its outcome in shop.job_runs (alerts on failure). */
export async function recordJob<T>(sql: Sql, job: string, fn: () => Promise<T>): Promise<T> {
  const [run] = await sql<{ id: number }[]>`insert into shop.job_runs (job) values (${job}) returning id`;
  try {
    const result = await fn();
    await sql`update shop.job_runs set finished_at = now(), ok = true, details = ${sql.json(JSON.parse(JSON.stringify(result ?? null)) as never)} where id = ${run!.id}`;
    await sql`delete from shop.job_runs where job = ${job} and started_at < now() - interval '30 days'`;
    return result;
  } catch (e) {
    await sql`update shop.job_runs set finished_at = now(), ok = false, error = ${String((e as Error).message).slice(0, 1000)} where id = ${run!.id}`;
    await sendAlert(`Scheduled job “${job}” failed: ${String((e as Error).message).slice(0, 300)}`);
    throw e;
  }
}

const recent = new Map<string, number>();

/**
 * Posts an alert to ALERT_WEBHOOK_URL (Slack/Discord/Google Chat style `{ text }`), at most once
 * per message per 10 minutes. Never includes request bodies or personal data.
 */
export async function sendAlert(text: string, env: NodeJS.ProcessEnv = process.env) {
  const url = env.ALERT_WEBHOOK_URL;
  const app = env.APP_NAME || "zentro";
  console.error(JSON.stringify({ level: "error", app, alert: text, at: new Date().toISOString() }));
  if (!url || !/^https:\/\//.test(url)) return;
  const key = text.slice(0, 120);
  if ((recent.get(key) ?? 0) > Date.now() - 600_000) return;
  recent.set(key, Date.now());
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `[${app}${env.APP_ENV ? `/${env.APP_ENV}` : ""}] ${text}` }), signal: AbortSignal.timeout(5000) }).catch(() => {});
}

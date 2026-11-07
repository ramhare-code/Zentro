import clsx from "clsx";
import { checkHealth } from "@zentro/commerce/ops";
import { SettingsNav } from "@/components/SettingsNav";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { integrationChecks } from "@/lib/health";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "System status" };

const bad = (v: string) => /missing|broken|stale|failed|never|incomplete|not configured|^[1-9]\d*$/i.test(v);

async function storefrontHealth(): Promise<Record<string, string> | { error: string }> {
  const base = process.env.STOREFRONT_URL, token = process.env.HEALTH_CHECK_TOKEN;
  if (!base) return { error: "STOREFRONT_URL isn’t set on the admin." };
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/api/health`, { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store", signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { status: string; checks?: Record<string, string>; db?: { migration: string | null } };
    if (!j.checks) return { status: j.status, details: token ? "token rejected" : "set HEALTH_CHECK_TOKEN on both apps to see details" };
    return { status: j.status, migration: j.db?.migration ?? "unknown", ...j.checks };
  } catch { return { error: "The storefront didn’t respond." }; }
}

function Checks({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section aria-label={title} className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      <dl className="mt-3 divide-y divide-line text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd className={clsx("text-right font-medium", bad(v) && k !== "activeOwners" ? "text-warn-700" : "text-good-700")}>{v}</dd></div>)}
      </dl>
    </section>
  );
}

export default async function SystemPage() {
  const s = await requirePermission("settings.manage");
  const sql = db();
  const [health, store, runs] = await Promise.all([
    checkHealth(sql, integrationChecks),
    storefrontHealth(),
    sql<{ job: string; startedAt: Date; finishedAt: Date | null; ok: boolean | null; error: string | null }[]>`
      select job, started_at as "startedAt", finished_at as "finishedAt", ok, error from shop.job_runs order by started_at desc limit 15`,
  ]);
  return (
    <div className="space-y-5">
      <SettingsNav active="/settings/system" title="System status" s={s} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Checks title="Admin site" rows={[["database", health.db.ok ? `ok (${health.db.latencyMs} ms)` : "DOWN"], ["migrations", health.db.upToDate ? `up to date (${health.db.migration})` : `behind — run migrations (at ${health.db.migration ?? "none"})`], ...Object.entries(health.checks)]} />
        {"error" in store ? <section aria-label="Storefront" className="card p-5"><h2 className="font-semibold">Storefront</h2><p className="mt-3 text-sm text-warn-700">{store.error}</p></section> : <Checks title="Storefront" rows={Object.entries(store)} />}
      </div>
      <section aria-label="Scheduled job runs" className="card overflow-x-auto p-5">
        <h2 className="font-semibold">Scheduled job (last 15 runs)</h2>
        <p className="text-xs text-ink-muted">Should run every 5 minutes. If it stops, payments aren’t re-checked, holds aren’t released and messages aren’t sent.</p>
        {runs.length === 0 ? <p className="mt-3 text-sm text-warn-700">It has never run. Check the cron set-up in docs/DEPLOYMENT.md.</p> : (
          <table className="mt-3 w-full text-sm"><tbody className="divide-y divide-line">{runs.map((r, i) => (
            <tr key={i}><td className="py-1.5">{r.job}</td><td className="text-ink-muted">{formatDateTime(r.startedAt)}</td>
              <td className={clsx("text-right font-medium", r.ok ? "text-good-700" : r.ok === false ? "text-bad-700" : "text-ink-muted")}>{r.ok ? `ok · ${r.finishedAt ? Math.max(0, r.finishedAt.getTime() - r.startedAt.getTime()) : "?"} ms` : r.ok === false ? `failed: ${r.error}` : "running"}</td></tr>
          ))}</tbody></table>
        )}
      </section>
      <section className="card p-5 text-sm">
        <h2 className="font-semibold">Backups</h2>
        <p className="mt-2 text-ink-muted">Supabase takes daily backups (point-in-time recovery on paid plans). For an independent copy, run <code>scripts/backup.sh</code> on a schedule and test restores monthly with <code>scripts/restore-check.sh</code> — see docs/DEPLOYMENT.md.</p>
      </section>
    </div>
  );
}

import Link from "next/link";
import { z } from "zod";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("audit.read");
  const sp = await searchParams;
  const action = z.string().regex(/^[a-z_.]{1,60}$/).safeParse(sp.action).data;
  const staff = z.string().trim().toLowerCase().max(200).safeParse(sp.staff).data || undefined;
  const from = z.string().date().safeParse(sp.from).data;
  const to = z.string().date().safeParse(sp.to).data;
  const page = z.coerce.number().int().min(1).max(1000).safeParse(sp.page).data ?? 1;
  const sql = db();

  const rows = await sql<{ id: string; occurredAt: Date; staffEmail: string | null; action: string; entityType: string | null; entityId: string | null; ip: string | null; details: Record<string, unknown> }[]>`
    select id::text, occurred_at as "occurredAt", staff_email as "staffEmail", action, entity_type as "entityType",
           entity_id as "entityId", host(ip) as ip, details
    from shop.audit_log
    where true
      ${action ? sql`and action like ${action + "%"}` : sql``}
      ${staff ? sql`and staff_email like ${"%" + staff.replace(/[%_]/g, "") + "%"}` : sql``}
      ${from ? sql`and occurred_at >= (${from}::date at time zone 'Asia/Kolkata')` : sql``}
      ${to ? sql`and occurred_at < ((${to}::date + 1) at time zone 'Asia/Kolkata')` : sql``}
    order by id desc
    limit ${PAGE + 1} offset ${(page - 1) * PAGE}`;

  let integrity: string | null = null;
  if (sp.verify === "1") {
    const [r] = await sql<{ broken: string | null }[]>`select shop.verify_audit_chain()::text as broken`;
    integrity = r?.broken ? `Tampering detected at entry #${r.broken}.` : "Intact — every entry matches the hash chain.";
  }
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries({ action, staff, from, to }).filter(([, v]) => v) as [string, string][]);
    if (p > 1) u.set("page", String(p));
    return `?${u}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-ink-muted">Append-only and hash-chained: entries can’t be edited or deleted without detection.</p>
        </div>
        <Link href={`${qs(page)}&verify=1`} className="btn btn-secondary">Verify integrity</Link>
      </div>
      {integrity && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${integrity.startsWith("Intact") ? "bg-good-50 text-good-700" : "bg-bad-50 text-bad-700"}`}>{integrity}</p>}

      <form className="card grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
        <label className="text-sm font-medium">Action starts with<input name="action" defaultValue={action} placeholder="e.g. auth." className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Staff email<input name="staff" defaultValue={staff} className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">From<input type="date" name="from" defaultValue={from} className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">To<input type="date" name="to" defaultValue={to} className="input mt-1.5 h-10" /></label>
        <button className="btn btn-primary h-10">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr><th className="px-5 py-3">When</th><th className="px-3 py-3">Who</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Target</th><th className="px-3 py-3">Details</th><th className="px-5 py-3">IP</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, PAGE).map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{formatDateTime(r.occurredAt)}</td>
                <td className="px-3 py-3">{r.staffEmail ?? <span className="text-ink-subtle">system</span>}</td>
                <td className="px-3 py-3"><code className="rounded bg-canvas px-1.5 py-0.5 text-xs">{r.action}</code></td>
                <td className="px-3 py-3 text-ink-muted">{r.entityType ? `${r.entityType} ${r.entityId?.slice(0, 8) ?? ""}` : "—"}</td>
                <td className="max-w-md px-3 py-3"><code className="break-all text-xs text-ink-muted">{Object.keys(r.details).length ? JSON.stringify(r.details) : "—"}</code></td>
                <td className="px-5 py-3 text-ink-muted">{r.ip ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">No entries match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex justify-between">
        {page > 1 ? <Link href={qs(page - 1)} className="btn btn-secondary">← Newer</Link> : <span />}
        {rows.length > PAGE && <Link href={qs(page + 1)} className="btn btn-secondary">Older →</Link>}
      </nav>
    </div>
  );
}

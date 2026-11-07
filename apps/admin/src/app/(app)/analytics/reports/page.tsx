import Link from "next/link";
import { AnalyticsNav } from "@/components/AnalyticsNav";
import { RangePicker } from "@/components/RangePicker";
import { parseRange } from "@/lib/metrics";
import { REPORTS } from "@/lib/reports";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Reports & exports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("analytics.read");
  const range = parseRange(await searchParams);
  const canExport = s.permissions.has("reports.export");
  const pii = s.permissions.has("customers.pii");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Reports & exports</h1><p className="mt-1 text-sm text-ink-muted">{range.from} → {range.to} (IST)</p><div className="mt-2"><AnalyticsNav active="/analytics/reports" range={range} /></div></div>
        <RangePicker range={range} />
      </div>
      {!canExport && <p className="card p-4 text-sm">Downloading reports needs the “Export reports” permission.</p>}
      {canExport && !pii && <p className="card p-4 text-sm text-ink-muted">Customer emails and phone numbers are masked in your downloads (you don’t have permission to see full contact details).</p>}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(REPORTS).map(([key, r]) => (
          <li key={key} className="card flex flex-col p-5">
            <h2 className="font-semibold">{r.title}</h2>
            <p className="mt-1 flex-1 text-sm text-ink-muted">{r.description}</p>
            {canExport && <a href={`/api/reports/${key}?from=${range.from}&to=${range.to}`} className="btn btn-secondary mt-4 self-start" aria-label={`Download ${r.title} CSV`}>Download CSV</a>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-subtle">Every download is recorded in the <Link href="/audit-logs?action=report.export" className="underline">audit log</Link>. GST and profit reports are under <Link href="/finance" className="underline">Finance</Link>.</p>
    </div>
  );
}

import { formatPaise } from "@zentro/commerce";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { FunnelChart, TrendChart } from "@/components/dashboard/VisitorCharts";
import { RangePicker } from "@/components/RangePicker";
import { getVisitorAnalytics } from "@/lib/analytics";
import { parseRange } from "@/lib/metrics";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Analytics" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

function Table({ title, cols, rows }: { title: string; cols: string[]; rows: (string | number)[][] }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No data yet.</p> : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>{cols.map((c, i) => <th key={c} className={`py-2 ${i > 0 ? "text-right" : ""}`}>{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={`py-2 ${j > 0 ? "text-right tabular-nums" : "max-w-[18rem] truncate"}`}>{typeof v === "number" ? v.toLocaleString("en-IN") : v}</td>)}</tr>)}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("analytics.read");
  const range = parseRange(await searchParams);
  const a = await getVisitorAnalytics(range);
  const t = a.totals;
  const conv = t.sessions ? ((t.purchases / t.sessions) * 100).toFixed(1) : "0.0";
  const pagesPerSession = t.sessions ? ((t.pageViews - t.anonViews) / t.sessions).toFixed(1) : "—";
  const monthly = range.bucket === "month";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visitor analytics</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            <span>{range.from} → {range.to} (IST)</span>
            <AutoRefresh />
          </div>
        </div>
        <RangePicker range={range} />
      </div>

      <section aria-label="Visitor totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Live now" value={t.liveNow.toLocaleString("en-IN")} sub="Sessions active in the last 5 min" />
        <Stat label="Page views" value={t.pageViews.toLocaleString("en-IN")} sub={`${t.anonViews.toLocaleString("en-IN")} from visitors who declined analytics`} />
        <Stat label="Unique visitors" value={t.visitors.toLocaleString("en-IN")} sub="Visitors who allowed analytics" />
        <Stat label="Sessions" value={t.sessions.toLocaleString("en-IN")} sub={`${pagesPerSession} pages per session`} />
        <Stat label="Conversion rate" value={`${conv}%`} sub={`${t.purchases} purchasing sessions · ${formatPaise(t.revenue)}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5"><h2 className="mb-3 font-semibold">Unique visitors</h2><TrendChart data={a.daily} dataKey="visitors" label="Visitors" monthly={monthly} /></section>
        <section className="card p-5"><h2 className="mb-3 font-semibold">Page views</h2><TrendChart data={a.daily} dataKey="pageViews" label="Page views" monthly={monthly} /></section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-5">
          <h2 className="font-semibold">Shopping funnel</h2>
          <p className="mb-3 text-sm text-ink-muted">Sessions reaching each step (consented visitors).</p>
          <FunnelChart data={a.funnel} />
        </section>
        <Table title="Traffic sources" cols={["Source", "Visits"]} rows={a.sources.map((s) => [s.source, s.sessions])} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Table title="Top pages" cols={["Page", "Views", "Visitors"]} rows={a.pages.map((p) => [p.path, p.views, p.visitors])} />
        <Table title="Most viewed products" cols={["Product", "Views", "Add to cart"]} rows={a.products.map((p) => [p.name ?? "Deleted product", p.views, p.addToCart])} />
        <Table title="Top searches" cols={["Search", "Count"]} rows={a.searches.map((s) => [s.query, s.n])} />
        <div className="grid gap-6 sm:grid-cols-2">
          <Table title="Devices" cols={["Device", "Views"]} rows={a.devices.map((d) => [d.device, d.n])} />
          <Table title="Countries" cols={["Country", "Views"]} rows={a.countries.map((c) => [c.country, c.n])} />
        </div>
      </div>
      <p className="text-xs text-ink-subtle">First-party analytics: no IP addresses stored, no third-party trackers. Visitor IDs are created only after consent.</p>
    </div>
  );
}

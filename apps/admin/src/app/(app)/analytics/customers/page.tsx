import Link from "next/link";
import { formatPaise, stateName } from "@zentro/commerce";
import { AnalyticsNav } from "@/components/AnalyticsNav";
import { RangePicker } from "@/components/RangePicker";
import { customerAnalytics } from "@/lib/customer-analytics";
import { formatDateTime } from "@/lib/format";
import { maskEmail } from "@/lib/mask";
import { parseRange } from "@/lib/metrics";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Customers & sales" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="card p-4"><p className="text-sm text-ink-muted">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}</div>;
}
function Table({ title, cols, rows }: { title: string; cols: string[]; rows: React.ReactNode[][] }) {
  return (
    <section aria-label={title} className="card overflow-x-auto p-5">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No paid orders in this period.</p> : (
        <table className="mt-3 w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-ink-muted"><tr>{cols.map((c, i) => <th key={c} className={`pb-2 ${i ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`py-2 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>)}</tbody></table>
      )}
    </section>
  );
}

export default async function CustomerAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("analytics.read");
  const range = parseRange(await searchParams);
  const a = await customerAnalytics(range);
  const t = a.totals;
  const pii = s.permissions.has("customers.pii");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Customers & sales</h1><p className="mt-1 text-sm text-ink-muted">{range.from} → {range.to} (IST) · from paid orders, so it includes visitors who declined analytics cookies.</p><div className="mt-2"><AnalyticsNav active="/analytics/customers" range={range} /></div></div>
        <RangePicker range={range} />
      </div>
      <section aria-label="Customer totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Paying customers" value={t.customers.toLocaleString("en-IN")} sub={`${t.newCustomers} new · ${t.returningCustomers} returning`} />
        <Stat label="Paid orders" value={t.orders.toLocaleString("en-IN")} sub={`${t.repeatOrders} from returning customers`} />
        <Stat label="Average order value" value={t.orders ? formatPaise(Math.round(t.revenue / t.orders)) : "—"} sub={t.itemsPerOrder ? `${t.itemsPerOrder} items per order` : undefined} />
        <Stat label="Repeat customer rate" value={t.repeatRate === null ? "—" : `${t.repeatRate}%`} sub="Of all customers ever, share with 2+ orders" />
        <Stat label="Revenue per customer" value={t.customers ? formatPaise(Math.round(t.revenue / t.customers)) : "—"} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Table title="Sales by state" cols={["State", "Orders", "Revenue"]} rows={a.byState.map((r) => [`${stateName(r.state)} (${r.state})`, r.orders, formatPaise(r.revenue)])} />
        <Table title="Sales by category" cols={["Category", "Units", "Revenue"]} rows={a.byCategory.map((r) => [r.category, r.units, formatPaise(r.revenue)])} />
        <Table title="Top customers" cols={["Customer", "Orders", "Spent", "Last order"]} rows={a.top.map((r) => [
          r.customerId ? <Link key="c" href={`/customers/${r.customerId}`} className="text-brand-700 hover:underline">{pii ? `${r.name} · ${r.email}` : `${r.name.split(" ")[0]} · ${maskEmail(r.email)}`}</Link> : (pii ? `${r.name} · ${r.email} (guest)` : `${r.name.split(" ")[0]} · ${maskEmail(r.email)} (guest)`),
          r.orders, formatPaise(r.revenue), formatDateTime(r.lastAt)])} />
        <Table title="How often customers buy (all time)" cols={["Orders placed", "Customers"]} rows={a.buckets.map((b) => [b.bucket, b.customers])} />
      </div>
    </div>
  );
}

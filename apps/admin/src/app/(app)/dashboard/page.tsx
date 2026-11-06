import Link from "next/link";
import clsx from "clsx";
import { formatPaise, ORDER_STATUS_LABELS } from "@zentro/commerce";
import { Icon } from "@/components/Icon";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { OrderStatusChart, RevenueChart } from "@/components/dashboard/Charts";
import { timeAgo } from "@/lib/format";
import { getDashboard, getRecentActivity, parseRange, RANGE_PRESETS } from "@/lib/metrics";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Dashboard" };

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0) return now > 0 ? <span className="text-xs text-ink-muted">No sales in previous period</span> : null;
  const pct = ((now - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={clsx("inline-flex items-center gap-0.5 text-xs font-semibold", up ? "text-good-700" : "text-bad-700")}>
      <Icon name={up ? "arrowUp" : "arrowDown"} size={13} />
      {Math.abs(pct).toFixed(1)}% <span className="font-normal text-ink-muted">vs previous period</span>
    </span>
  );
}

function Kpi({ label, value, sub, href }: { label: string; value: string; sub?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </>
  );
  return href ? <Link href={href} className="card block p-5 hover:ring-brand-200">{body}</Link> : <div className="card p-5">{body}</div>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("dashboard.view");
  const range = parseRange(await searchParams);
  const finance = s.permissions.has("finance.read") || s.permissions.has("analytics.read");
  const [d, activity] = await Promise.all([getDashboard(range), getRecentActivity(s.permissions.has("audit.read"))]);
  const k = d.kpi;
  const net = k.gross - k.refunds;
  const aov = k.paidOrders ? Math.round(k.gross / k.paidOrders) : 0;
  const newBuyers = k.buyers - k.returningBuyers;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Good to see you, {s.fullName.split(" ")[0]}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            <span>{range.from} → {range.to} (IST)</span>
            <AutoRefresh />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Date range" className="flex rounded-xl bg-white p-1 ring-1 ring-line">
            {Object.keys(RANGE_PRESETS).map((key) => (
              <Link key={key} href={`?range=${key}`} aria-current={range.key === key ? "true" : undefined}
                className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold", range.key === key ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-canvas")}>
                {key}
              </Link>
            ))}
          </nav>
          <form className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="from">From</label>
            <input id="from" type="date" name="from" defaultValue={range.key === "custom" ? range.from : undefined} className="input h-9 w-36 text-sm" />
            <label className="sr-only" htmlFor="to">To</label>
            <input id="to" type="date" name="to" defaultValue={range.key === "custom" ? range.to : undefined} className="input h-9 w-36 text-sm" />
            <button className="btn btn-secondary h-9">Apply</button>
          </form>
        </div>
      </div>

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {finance && <Kpi label="Net revenue" value={formatPaise(net)} sub={<Delta now={k.gross} prev={k.prevGross} />} />}
        <Kpi label="Paid orders" value={k.paidOrders.toLocaleString("en-IN")} sub={<Delta now={k.paidOrders} prev={k.prevPaidOrders} />} />
        {finance && <Kpi label="Average order value" value={formatPaise(aov)} sub={k.refunds > 0 ? <span className="text-xs text-ink-muted">{formatPaise(k.refunds)} refunded</span> : undefined} />}
        <Kpi label="Awaiting fulfilment" value={k.pendingFulfilment.toLocaleString("en-IN")} sub={<span className="text-xs text-ink-muted">Confirmed, processing or packed</span>} href="/orders" />
        <Kpi label="Registered customers" value={k.customers.toLocaleString("en-IN")} sub={<span className="text-xs text-ink-muted">+{k.newCustomers} in this period</span>} />
        <Kpi label="Buyers in period" value={k.buyers.toLocaleString("en-IN")} sub={<span className="text-xs text-ink-muted">{newBuyers} new · {k.returningBuyers} returning</span>} />
        <Kpi label="Active products" value={k.activeProducts.toLocaleString("en-IN")} sub={k.outOfStock ? <span className="text-xs font-semibold text-bad-700">{k.outOfStock} variant(s) out of stock</span> : <span className="text-xs text-ink-muted">All variants in stock</span>} href="/products" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {finance ? (
          <section className="card p-5" aria-labelledby="rev-h">
            <h2 id="rev-h" className="font-semibold">Revenue</h2>
            <p className="mb-4 text-sm text-ink-muted">Paid orders by {range.bucket}, including any later refunds.</p>
            <RevenueChart data={d.series} monthly={range.bucket === "month"} />
          </section>
        ) : null}
        <section className="card p-5" aria-labelledby="status-h">
          <h2 id="status-h" className="font-semibold">Orders by status</h2>
          <p className="mb-4 text-sm text-ink-muted">Orders created in this period.</p>
          <OrderStatusChart data={d.statuses.map((x) => ({ label: ORDER_STATUS_LABELS[x.status], n: x.n }))} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-5" aria-labelledby="low-h">
          <div className="flex items-center justify-between">
            <h2 id="low-h" className="font-semibold">Low-stock alerts</h2>
            <Link href="/inventory?filter=low" className="text-sm font-semibold text-brand-700 hover:underline">Inventory →</Link>
          </div>
          {d.lowStock.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No variants at or below their threshold.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="py-2">Product</th><th className="py-2">SKU</th><th className="py-2 text-right">Stock</th></tr></thead>
              <tbody className="divide-y divide-line">
                {d.lowStock.map((v) => (
                  <tr key={v.sku}>
                    <td className="py-2.5">{v.name}{Object.keys(v.options).length > 0 && <span className="text-ink-muted"> · {Object.values(v.options).join(" / ")}</span>}</td>
                    <td className="py-2.5 font-mono text-xs text-ink-muted">{v.sku}</td>
                    <td className="py-2.5 text-right">
                      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", v.stock === 0 ? "bg-bad-50 text-bad-700" : "bg-warn-50 text-warn-700")}>
                        {v.stock === 0 ? "Out of stock" : `${v.stock} left`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-5" aria-labelledby="act-h">
          <h2 id="act-h" className="font-semibold">Recent activity</h2>
          {activity.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No order or admin activity yet.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {activity.map((a, i) => (
                <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className={clsx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", a.kind === "order" ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-muted")}>
                    <Icon name={a.kind === "order" ? "cart" : "shield"} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    {a.href ? <Link href={a.href} className="font-medium hover:underline">{a.text}</Link> : <span className="font-medium capitalize">{a.text}</span>}
                    <span className="block text-xs text-ink-muted">{a.actor ?? "system"} · {timeAgo(a.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

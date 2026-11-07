import Link from "next/link";
import clsx from "clsx";
import { formatPaise, ORDER_STATUS_LABELS, ORDER_STATUSES } from "@zentro/commerce";
import { PaymentLabel, StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { maskEmail, maskPhone } from "@/lib/mask";
import { listOrders, PAGE_SIZE, parseOrderFilters } from "@/lib/orders";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("orders.read");
  const f = parseOrderFilters(await searchParams);
  const { rows, total, counts } = await listOrders(f);
  const pii = s.permissions.has("customers.pii");
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, status: f.status, payment: f.payment, from: f.from, to: f.to, ...over })) if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) p.set(k, String(v));
    const str = p.toString();
    return str ? `?${str}` : "?";
  };
  const queue: (typeof ORDER_STATUSES)[number][] = ["confirmed", "processing", "packed", "shipped"];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        {s.permissions.has("orders.update") && s.permissions.has("customers.pii") && <Link href="/orders/labels" className="btn btn-secondary">Print labels for packed orders</Link>}
      </div>
      <nav aria-label="Fulfilment queues" className="flex flex-wrap gap-2">
        <Link href={qs({ status: undefined, page: 1 })} className={clsx("rounded-full px-3 py-1.5 text-sm font-semibold ring-1", !f.status ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-line hover:bg-canvas")}>All</Link>
        {queue.map((st) => (
          <Link key={st} href={qs({ status: st, page: 1 })} className={clsx("rounded-full px-3 py-1.5 text-sm font-semibold ring-1", f.status === st ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-line hover:bg-canvas")}>
            {ORDER_STATUS_LABELS[st]} <span className="opacity-70">{counts[st] ?? 0}</span>
          </Link>
        ))}
      </nav>
      <form className="card grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-end">
        <label className="text-sm font-medium">Search<input name="q" defaultValue={f.q} placeholder="Order no., email, phone or name" className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Status
          <select name="status" defaultValue={f.status ?? ""} className="input mt-1.5 h-10"><option value="">Any</option>{ORDER_STATUSES.map((st) => <option key={st} value={st}>{ORDER_STATUS_LABELS[st]}</option>)}</select>
        </label>
        <label className="text-sm font-medium">Payment
          <select name="payment" defaultValue={f.payment ?? ""} className="input mt-1.5 h-10"><option value="">Any</option>{["pending", "paid", "failed", "refund_pending", "partially_refunded", "refunded"].map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}</select>
        </label>
        <label className="text-sm font-medium">From<input type="date" name="from" defaultValue={f.from} className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">To<input type="date" name="to" defaultValue={f.to} className="input mt-1.5 h-10" /></label>
        <button className="btn btn-primary h-10">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr><th className="px-5 py-3">Order</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Items</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Payment</th><th className="px-5 py-3 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-canvas">
                <td className="px-5 py-3"><Link href={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link></td>
                <td className="px-3 py-3 text-ink-muted">{formatDateTime(o.createdAt)}</td>
                <td className="px-3 py-3"><span className="block">{o.name}</span><span className="text-xs text-ink-muted">{pii ? o.email : maskEmail(o.email)} · {pii ? o.phone : maskPhone(o.phone)}</span></td>
                <td className="px-3 py-3">{o.items}</td>
                <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-3 py-3"><PaymentLabel status={o.paymentStatus} /></td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatPaise(o.totalPaise)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-ink-muted">No orders match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">{total.toLocaleString("en-IN")} order(s)</span>
        <span className="flex gap-2">
          {f.page > 1 && <Link href={qs({ page: f.page - 1 })} className="btn btn-secondary">← Previous</Link>}
          {f.page < pages && <Link href={qs({ page: f.page + 1 })} className="btn btn-secondary">Next →</Link>}
        </span>
      </nav>
    </div>
  );
}

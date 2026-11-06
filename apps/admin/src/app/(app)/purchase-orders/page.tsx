import Link from "next/link";
import clsx from "clsx";
import { formatPaise } from "@zentro/commerce";
import { InventoryNav } from "@/components/InventoryNav";
import { PoStatus } from "@/components/PoStatus";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Purchase orders" };
const FILTERS = { open: ["draft", "ordered", "partially_received"], done: ["received", "closed", "cancelled"] } as const;

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("purchase_orders.manage");
  const { status } = await searchParams;
  const filter = status === "done" ? "done" : status === "all" ? "all" : "open";
  const sql = db();
  const rows = await sql<{ id: string; number: string; supplier: string; status: string; expected: string | null; createdAt: Date; lines: number; ordered: number; received: number; total: number; overdue: boolean }[]>`
    select po.id, po.po_number as number, s.name as supplier, po.status, po.expected_date::text as expected, po.created_at as "createdAt",
           count(i.id)::int as lines, coalesce(sum(i.quantity_ordered), 0)::int as ordered, coalesce(sum(i.quantity_received), 0)::int as received,
           coalesce(sum(i.quantity_ordered * i.unit_cost_paise), 0)::bigint::float8 as total,
           (po.status in ('ordered','partially_received') and po.expected_date < (now() at time zone 'Asia/Kolkata')::date) as overdue
    from shop.purchase_orders po join shop.suppliers s on s.id = po.supplier_id left join shop.purchase_order_items i on i.po_id = po.id
    where true ${filter !== "all" ? sql`and po.status in ${sql([...FILTERS[filter]])}` : sql``}
    group by po.id, s.name order by po.created_at desc limit 200`;
  return (
    <div className="space-y-5">
      <InventoryNav active="/purchase-orders" title="Purchase orders"><Link href="/purchase-orders/new" className="btn btn-primary">New purchase order</Link></InventoryNav>
      <nav aria-label="Filter" className="flex gap-2 text-sm">
        {(["open", "done", "all"] as const).map((k) => <Link key={k} href={`/purchase-orders?status=${k}`} aria-current={filter === k ? "page" : undefined} className={clsx("rounded-full px-3 py-1 ring-1", filter === k ? "bg-ink text-white ring-ink" : "ring-line")}>{{ open: "Open", done: "Completed", all: "All" }[k]}</Link>)}
      </nav>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">PO</th><th className="px-3 py-3">Supplier</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Received</th><th className="px-3 py-3 text-right">Value</th><th className="px-5 py-3">Expected</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2.5"><Link href={`/purchase-orders/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{r.number}</Link><span className="block text-xs text-ink-muted">{formatDateTime(r.createdAt)}</span></td>
                <td className="px-3 py-2.5">{r.supplier}</td>
                <td className="px-3 py-2.5"><PoStatus status={r.status} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.received} / {r.ordered}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(r.total)}</td>
                <td className={clsx("px-5 py-2.5", r.overdue ? "font-semibold text-bad-700" : "text-ink-muted")}>{r.expected ?? "—"}{r.overdue && " · overdue"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">No purchase orders here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

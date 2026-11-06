import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { InventoryNav } from "@/components/InventoryNav";
import { PoStatus } from "@/components/PoStatus";
import { purchaseOrderStatusAction, receivePurchaseOrderAction, updatePurchaseOrderLinesAction } from "@/lib/actions/inventory";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("purchase_orders.manage");
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const sql = db();
  const [po] = await sql<{ number: string; status: string; supplier: string; supplierPhone: string | null; supplierEmail: string | null; expected: string | null; notes: string | null; createdAt: Date; orderedAt: Date | null; receivedAt: Date | null; closedAt: Date | null; createdBy: string | null }[]>`
    select po.po_number as number, po.status, s.name as supplier, s.phone as "supplierPhone", s.email as "supplierEmail", po.expected_date::text as expected, po.notes,
           po.created_at as "createdAt", po.ordered_at as "orderedAt", po.received_at as "receivedAt", po.closed_at as "closedAt", u.full_name as "createdBy"
    from shop.purchase_orders po join shop.suppliers s on s.id = po.supplier_id left join shop.staff_users u on u.id = po.created_by where po.id = ${id}`;
  if (!po) notFound();
  const items = await sql<{ id: string; sku: string; product: string; productId: string; ordered: number; received: number; cost: number; stock: number }[]>`
    select i.id, v.sku, p.name as product, p.id as "productId", i.quantity_ordered as ordered, i.quantity_received as received, i.unit_cost_paise as cost, v.stock
    from shop.purchase_order_items i join shop.product_variants v on v.id = i.variant_id join shop.products p on p.id = v.product_id
    where i.po_id = ${id} order by v.sku`;
  const total = items.reduce((a, i) => a + i.ordered * i.cost, 0);
  const receivable = ["ordered", "partially_received"].includes(po.status);
  const canReceive = receivable && s.permissions.has("inventory.adjust");
  return (
    <div className="space-y-5">
      <InventoryNav active="/purchase-orders" title={po.number}><PoStatus status={po.status} /></InventoryNav>
      <section className="card grid gap-4 p-5 text-sm sm:grid-cols-3">
        <div><p className="text-ink-muted">Supplier</p><p className="font-semibold">{po.supplier}</p><p className="text-xs text-ink-muted">{[po.supplierPhone, po.supplierEmail].filter(Boolean).join(" · ")}</p></div>
        <div><p className="text-ink-muted">Expected</p><p className="font-semibold">{po.expected ?? "Not set"}</p></div>
        <div><p className="text-ink-muted">Value at cost (before GST)</p><p className="font-semibold tabular-nums">{formatPaise(total)}</p></div>
        <div className="text-xs text-ink-muted sm:col-span-3">Created {formatDateTime(po.createdAt)}{po.createdBy && ` by ${po.createdBy}`}{po.orderedAt && ` · ordered ${formatDateTime(po.orderedAt)}`}{po.receivedAt && ` · fully received ${formatDateTime(po.receivedAt)}`}{po.closedAt && ` · closed ${formatDateTime(po.closedAt)}`}{po.notes && <span className="mt-1 block whitespace-pre-line text-ink">{po.notes}</span>}</div>
      </section>

      <ActionForm action={receivePurchaseOrderAction} className="card overflow-x-auto">
        <input type="hidden" name="poId" value={id} />
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Item</th><th className="px-3 py-3 text-right">Unit cost</th><th className="px-3 py-3 text-right">Ordered</th><th className="px-3 py-3 text-right">Received</th><th className="px-3 py-3 text-right">In stock</th>{canReceive && <th className="px-5 py-3 text-right">Receive now</th>}</tr></thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-5 py-2.5"><Link href={`/products/${i.productId}`} className="text-brand-700 hover:underline">{i.product}</Link><span className="block font-mono text-xs text-ink-muted">{i.sku}</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(i.cost)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{i.ordered}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{i.received}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{i.stock}</td>
                {canReceive && <td className="px-5 py-2"><input key={`${i.id}:${i.received}`} name={`recv:${i.id}`} aria-label={`Receive ${i.sku}`} inputMode="numeric" disabled={i.received >= i.ordered} placeholder={i.received >= i.ordered ? "done" : `≤ ${i.ordered - i.received}`} className="input ml-auto h-9 w-24 text-right" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {canReceive && (
          <div className="flex flex-wrap items-end gap-3 border-t border-line p-4">
            <label className="flex-1 text-sm font-medium">Delivery note / invoice no. (optional)<input name="note" maxLength={300} className="input mt-1.5" /></label>
            <SubmitButton>Receive stock</SubmitButton>
          </div>
        )}
        {receivable && !canReceive && <p className="border-t border-line p-4 text-sm text-ink-muted">Receiving stock needs the inventory-adjust permission.</p>}
      </ActionForm>

      {po.status === "draft" && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Edit lines</summary>
          <ActionForm action={updatePurchaseOrderLinesAction} className="mt-3 space-y-3">
            <input type="hidden" name="poId" value={id} />
            <label className="block text-sm font-medium">Lines (SKU, quantity, unit cost in ₹)<textarea name="lines" rows={6} defaultValue={items.map((i) => `${i.sku}, ${i.ordered}, ${(i.cost / 100).toFixed(2)}`).join("\n")} className="input mt-1.5 h-auto py-2 font-mono text-sm" /></label>
            <label className="block text-sm font-medium">Expected delivery<input name="expectedDate" type="date" defaultValue={po.expected ?? ""} className="input mt-1.5 w-48" /></label>
            <label className="block text-sm font-medium">Notes<textarea name="notes" rows={2} defaultValue={po.notes ?? ""} className="input mt-1.5 h-auto py-2" /></label>
            <SubmitButton variant="secondary">Save changes</SubmitButton>
          </ActionForm>
        </details>
      )}

      {/* stays mounted when the status changes so the result message remains visible */}
        <ActionForm action={purchaseOrderStatusAction} className={["draft", "ordered", "partially_received"].includes(po.status) ? "card flex flex-wrap items-center gap-2 p-4" : ""}>
          <input type="hidden" name="poId" value={id} />
          {po.status === "draft" && <SubmitButton name="op" value="order">Mark as ordered</SubmitButton>}
          {po.status === "partially_received" && <SubmitButton name="op" value="close" variant="secondary" confirm="Close this purchase order? The remaining quantity will no longer be expected.">Close (stop expecting the rest)</SubmitButton>}
          {["draft", "ordered"].includes(po.status) && items.every((i) => i.received === 0) && <SubmitButton name="op" value="cancel" variant="danger" confirm="Cancel this purchase order?">Cancel purchase order</SubmitButton>}
        </ActionForm>
    </div>
  );
}

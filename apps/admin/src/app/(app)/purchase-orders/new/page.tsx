import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { InventoryNav } from "@/components/InventoryNav";
import { createPurchaseOrderAction } from "@/lib/actions/inventory";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  await requirePermission("purchase_orders.manage");
  const suppliers = await db()<{ id: string; name: string }[]>`select id, name from shop.suppliers where is_active order by lower(name)`;
  return (
    <div className="space-y-5">
      <InventoryNav active="/purchase-orders" title="New purchase order" />
      {suppliers.length === 0 ? (
        <p className="card p-6 text-sm">Add a supplier first. <Link href="/suppliers" className="font-semibold text-brand-700 underline">Go to suppliers</Link></p>
      ) : (
        <ActionForm action={createPurchaseOrderAction} className="card max-w-3xl space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Supplier<select name="supplierId" required className="input mt-1.5"><option value="">Choose…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="text-sm font-medium">Expected delivery<input name="expectedDate" type="date" className="input mt-1.5" /></label>
          </div>
          <label className="block text-sm font-medium">Lines
            <span className="block text-xs font-normal text-ink-muted">One per line: <code>SKU, quantity, unit cost in ₹ (before GST)</code></span>
            <textarea name="lines" required rows={8} placeholder={"ZN-001-BLK, 20, 450\nZN-002, 10, 1299.50"} className="input mt-1.5 h-auto py-2 font-mono text-sm" />
          </label>
          <label className="block text-sm font-medium">Notes<textarea name="notes" rows={2} className="input mt-1.5 h-auto py-2" /></label>
          <p className="text-xs text-ink-muted">The order is saved as a draft. Nothing is sent to the supplier — mark it as ordered once you’ve placed it with them.</p>
          <SubmitButton>Create draft</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

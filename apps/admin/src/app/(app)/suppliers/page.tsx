import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { InventoryNav } from "@/components/InventoryNav";
import { saveSupplierAction } from "@/lib/actions/inventory";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Suppliers" };

interface Supplier { id: string; name: string; contactName: string | null; email: string | null; phone: string | null; gstin: string | null; address: string | null; paymentTerms: string | null; leadTimeDays: number | null; notes: string | null; isActive: boolean; openPos: number }

function Fields({ s }: { s?: Supplier }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {s && <input type="hidden" name="supplierId" value={s.id} />}
      <label className="text-sm font-medium">Name<input name="name" required defaultValue={s?.name} className="input mt-1.5" /></label>
      <label className="text-sm font-medium">Contact person<input name="contactName" defaultValue={s?.contactName ?? ""} className="input mt-1.5" /></label>
      <label className="text-sm font-medium">Email<input name="email" type="email" defaultValue={s?.email ?? ""} className="input mt-1.5" /></label>
      <label className="text-sm font-medium">Phone<input name="phone" defaultValue={s?.phone ?? ""} className="input mt-1.5" /></label>
      <label className="text-sm font-medium">GSTIN<input name="gstin" defaultValue={s?.gstin ?? ""} maxLength={15} className="input mt-1.5 font-mono uppercase" /></label>
      <label className="text-sm font-medium">Lead time (days)<input name="leadTimeDays" inputMode="numeric" defaultValue={s?.leadTimeDays ?? ""} className="input mt-1.5" /></label>
      <label className="text-sm font-medium">Payment terms<input name="paymentTerms" defaultValue={s?.paymentTerms ?? ""} placeholder="e.g. Net 30" className="input mt-1.5" /></label>
      <label className="text-sm font-medium sm:col-span-2">Address<textarea name="address" rows={2} defaultValue={s?.address ?? ""} className="input mt-1.5 h-auto py-2" /></label>
      <label className="text-sm font-medium sm:col-span-2">Notes<textarea name="notes" rows={2} defaultValue={s?.notes ?? ""} className="input mt-1.5 h-auto py-2" /></label>
      {s && <label className="flex items-center gap-2 text-sm"><input type="hidden" name="isActive" value="off" /><input type="checkbox" name="isActive" defaultChecked={s.isActive} className="size-4" /> Active (can be used on new purchase orders)</label>}
    </div>
  );
}

export default async function SuppliersPage() {
  await requirePermission("suppliers.manage");
  const rows = await db()<Supplier[]>`
    select s.id, s.name, s.contact_name as "contactName", s.email, s.phone, s.gstin, s.address, s.payment_terms as "paymentTerms",
           s.lead_time_days as "leadTimeDays", s.notes, s.is_active as "isActive",
           (select count(*)::int from shop.purchase_orders po where po.supplier_id = s.id and po.status in ('draft','ordered','partially_received')) as "openPos"
    from shop.suppliers s order by s.is_active desc, lower(s.name)`;
  return (
    <div className="space-y-5">
      <InventoryNav active="/suppliers" title="Suppliers" />
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem] lg:items-start">
        <section aria-label="Supplier list" className="space-y-3">
          {rows.length === 0 && <p className="card p-8 text-center text-sm text-ink-muted">No suppliers yet. Add the businesses you buy stock from.</p>}
          {rows.map((s) => (
            <details key={s.id} className="card group">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4">
                <span><span className="font-semibold">{s.name}</span>{!s.isActive && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">Archived</span>}
                  <span className="block text-xs text-ink-muted">{[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}</span></span>
                <span className="text-xs text-ink-muted">{s.openPos} open PO(s){s.leadTimeDays !== null && ` · ${s.leadTimeDays}-day lead time`}</span>
              </summary>
              <ActionForm action={saveSupplierAction} className="border-t border-line p-4"><Fields s={s} /><div className="mt-3"><SubmitButton>Save supplier</SubmitButton></div></ActionForm>
            </details>
          ))}
        </section>
        <section aria-labelledby="new-supplier" className="card p-5">
          <h2 id="new-supplier" className="font-semibold">Add supplier</h2>
          <ActionForm action={saveSupplierAction} className="mt-3"><Fields /><div className="mt-3"><SubmitButton>Add supplier</SubmitButton></div></ActionForm>
        </section>
      </div>
    </div>
  );
}

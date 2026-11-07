import Link from "next/link";
import { loadStoreSettings } from "@zentro/commerce/settings";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsNav } from "@/components/SettingsNav";
import { saveProductTaxAction, saveTaxSettingsAction } from "@/lib/actions/settings";
import { GST_RATES } from "@/lib/catalog-admin";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Tax" };

export default async function TaxSettingsPage({ searchParams }: { searchParams: Promise<{ missing?: string; q?: string }> }) {
  const s = await requirePermission("tax.manage");
  const sp = await searchParams;
  const sql = db();
  const missing = sp.missing === "1";
  const q = sp.q?.trim().toLowerCase().replace(/[%_\\]/g, "").slice(0, 60);
  const [st, products, [counts]] = await Promise.all([
    loadStoreSettings(sql),
    sql<{ id: string; name: string; category: string; hsn: string | null; rate: string }[]>`
      select p.id, p.name, c.name as category, p.hsn_code as hsn, p.gst_rate::text as rate from shop.products p join shop.categories c on c.id = p.category_id
      where p.archived_at is null ${missing ? sql`and p.hsn_code is null` : sql``} ${q ? sql`and lower(p.name) like ${"%" + q + "%"}` : sql``}
      order by p.hsn_code is null desc, c.name, p.name limit 300`,
    sql<{ total: number; noHsn: number }[]>`select count(*)::int as total, count(*) filter (where hsn_code is null)::int as "noHsn" from shop.products where archived_at is null`,
  ]);
  return (
    <div className="space-y-5">
      <SettingsNav active="/settings/tax" title="Tax" s={s} />
      <ActionForm action={saveTaxSettingsAction} className="card max-w-3xl space-y-3 p-5">
        <h2 className="font-semibold">GST on shipping</h2>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="shippingGstMode" value="none" defaultChecked={st.shippingGstMode === "none"} className="mt-0.5 size-4" /><span><strong>No GST on shipping</strong><span className="block text-ink-muted">The delivery charge is collected as-is and reported separately.</span></span></label>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="shippingGstMode" value="highest_item_rate" defaultChecked={st.shippingGstMode === "highest_item_rate"} className="mt-0.5 size-4" /><span><strong>Shipping is part of the sale (composite supply)</strong><span className="block text-ink-muted">The delivery charge includes GST at the highest rate among the items in the order. This is the usual treatment when you charge delivery with goods — confirm with your accountant.</span></span></label>
        <p className="text-xs text-ink-muted">Applies to new orders only; the customer’s total doesn’t change, only how it’s split on the invoice. Changing it asks you to confirm it’s you.</p>
        <SubmitButton>Save</SubmitButton>
      </ActionForm>

      <section aria-labelledby="hsn" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="hsn" className="font-semibold">Product HSN codes and GST rates</h2><p className="text-sm text-ink-muted">{counts!.noHsn} of {counts!.total} products have no HSN code{counts!.noHsn > 0 && " — HSN is required on tax invoices and in GSTR-1"}.</p></div>
          <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Find a product" aria-label="Find a product" className="input h-10 w-56" />{missing && <input type="hidden" name="missing" value="1" />}<button className="btn btn-secondary h-10">Find</button>
            <Link href={missing ? "/settings/tax" : "/settings/tax?missing=1"} className="btn btn-secondary h-10">{missing ? "Show all" : "Missing HSN only"}</Link></form>
        </div>
        <ActionForm action={saveProductTaxAction} className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Product</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">HSN</th><th className="px-5 py-3">GST</th></tr></thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2"><Link href={`/products/${p.id}`} className="text-brand-700 hover:underline">{p.name}</Link></td>
                  <td className="px-3 py-2 text-ink-muted">{p.category}</td>
                  <td className="px-3 py-2"><input name={`hsn:${p.id}`} aria-label={`HSN for ${p.name}`} defaultValue={p.hsn ?? ""} inputMode="numeric" maxLength={8} className={`input h-9 w-28 font-mono ${p.hsn ? "" : "ring-warn-500"}`} /></td>
                  <td className="px-5 py-2"><select name={`gst:${p.id}`} aria-label={`GST rate for ${p.name}`} defaultValue={String(Number(p.rate))} className="input h-9 w-24">{GST_RATES.map((r) => <option key={r} value={String(r)}>{r}%</option>)}</select></td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-ink-muted">Nothing to show.</td></tr>}
            </tbody>
          </table>
          {products.length > 0 && <div className="border-t border-line p-4"><SubmitButton>Save changes</SubmitButton></div>}
        </ActionForm>
      </section>
    </div>
  );
}

import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ProductFields } from "@/components/ProductFields";
import { createProductAction } from "@/lib/actions/catalog";
import { catalogOptions } from "@/lib/catalog-admin";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requirePermission("products.write");
  const opts = await catalogOptions();
  return (
    <div className="max-w-4xl space-y-5">
      <div><Link href="/products" className="text-sm font-semibold text-brand-700 hover:underline">← Products</Link><h1 className="mt-1 text-2xl font-bold tracking-tight">Add product</h1>
        <p className="mt-1 text-sm text-ink-muted">It’s saved as a draft. Add images and more variants on the next screen, then publish.</p></div>
      <ActionForm action={createProductAction} className="card space-y-6 p-5">
        <ProductFields opts={opts} />
        <fieldset className="rounded-xl bg-canvas p-4">
          <legend className="px-1 text-sm font-semibold">First variant</legend>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm font-medium">SKU<input name="sku" required maxLength={40} className="input mt-1.5 font-mono uppercase" /></label>
            <label className="text-sm font-medium">Price (₹)<input name="price" required inputMode="decimal" className="input mt-1.5" /></label>
            <label className="text-sm font-medium">MRP (₹)<input name="mrp" inputMode="decimal" className="input mt-1.5" /></label>
            <label className="text-sm font-medium">Opening stock<input name="stock" type="number" min={0} defaultValue={0} className="input mt-1.5" /></label>
          </div>
        </fieldset>
        <SubmitButton>Create draft</SubmitButton>
      </ActionForm>
    </div>
  );
}

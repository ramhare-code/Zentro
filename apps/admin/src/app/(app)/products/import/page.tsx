import Link from "next/link";
import { ImportForm } from "@/components/catalog/ImportForm";
import { IMPORT_COLUMNS } from "@/lib/catalog-admin";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Import products" };

export default async function ImportPage() {
  await requirePermission("products.write");
  return (
    <div className="max-w-3xl space-y-5">
      <div><Link href="/products" className="text-sm font-semibold text-brand-700 hover:underline">← Products</Link><h1 className="mt-1 text-2xl font-bold tracking-tight">Import products from CSV</h1></div>
      <div className="card space-y-2 p-5 text-sm text-ink-muted">
        <p>One row per <strong>variant</strong>. Rows with the same <code>slug</code> belong to one product; product details are taken from its first row. Existing products (by slug) and variants (by SKU) are updated, so re-importing is safe.</p>
        <p>Required: <code>slug, name, category_slug, sku, price</code>. Optional: {IMPORT_COLUMNS.filter((c) => !["slug", "name", "category_slug", "sku", "price"].includes(c)).map((c) => <code key={c} className="mr-1">{c}</code>)}. Prices are in rupees and include GST; <code>highlights</code> are separated by “|”; <code>options</code> look like <code>Color=Black; Size=M</code>; <code>status</code> is draft or published.</p>
        <p>Stock changes made by an import are logged as stock movements. Nothing is changed until you press Import, and if any row has a problem nothing is imported.</p>
        <a href="/api/products/template" className="inline-block font-semibold text-brand-700 hover:underline">Download template CSV</a>
      </div>
      <ImportForm />
    </div>
  );
}

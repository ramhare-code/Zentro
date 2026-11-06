import Link from "next/link";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ProductStatusBadge } from "@/components/ProductStatus";
import { bulkProductsAction } from "@/lib/actions/catalog";
import { catalogOptions, listAdminProducts } from "@/lib/catalog-admin";
import { formatDateTime } from "@/lib/format";
import { mediaSrc } from "@/lib/media";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("products.read");
  const sp = await searchParams;
  const f = {
    q: sp.q?.trim().slice(0, 100) || undefined,
    status: z.enum(["draft", "scheduled", "published", "archived"]).safeParse(sp.status).data,
    categoryId: z.guid().safeParse(sp.category).data,
    brandId: z.guid().safeParse(sp.brand).data,
    stock: z.enum(["out", "low"]).safeParse(sp.stock).data,
    page: z.coerce.number().int().min(1).max(1000).safeParse(sp.page).data ?? 1,
  };
  const [{ rows, total }, opts] = await Promise.all([listAdminProducts(f), catalogOptions()]);
  const canWrite = s.permissions.has("products.write") || s.permissions.has("products.publish") || s.permissions.has("products.archive");
  const qs = (p: number) => "?" + new URLSearchParams(Object.entries({ q: f.q, status: f.status, category: f.categoryId, brand: f.brandId, stock: f.stock, page: p > 1 ? String(p) : undefined }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        {s.permissions.has("products.write") && (
          <div className="flex gap-2"><Link href="/products/import" className="btn btn-secondary">Import CSV</Link><Link href="/products/new" className="btn btn-primary">Add product</Link></div>
        )}
      </div>
      <form className="card grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-end">
        <label className="text-sm font-medium">Search<input name="q" defaultValue={f.q} placeholder="Name, slug or SKU" className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Status<select name="status" defaultValue={f.status ?? ""} className="input mt-1.5 h-10"><option value="">Any</option><option value="published">Published</option><option value="scheduled">Scheduled</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
        <label className="text-sm font-medium">Category<select name="category" defaultValue={f.categoryId ?? ""} className="input mt-1.5 h-10"><option value="">Any</option>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="text-sm font-medium">Brand<select name="brand" defaultValue={f.brandId ?? ""} className="input mt-1.5 h-10"><option value="">Any</option>{opts.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="text-sm font-medium">Stock<select name="stock" defaultValue={f.stock ?? ""} className="input mt-1.5 h-10"><option value="">Any</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>
        <button className="btn btn-primary h-10">Filter</button>
      </form>
      <ActionForm action={bulkProductsAction} className="space-y-3">
        {canWrite && (
          <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="font-medium">With selected:</span>
            <select name="op" aria-label="Bulk action" className="input h-9 w-52 text-sm" defaultValue="publish">
              <option value="publish">Publish</option><option value="unpublish">Unpublish (draft)</option><option value="feature">Feature on homepage</option>
              <option value="unfeature">Remove from featured</option><option value="move">Move to category…</option><option value="archive">Archive</option>
            </select>
            <select name="categoryId" aria-label="Target category" className="input h-9 w-56 text-sm" defaultValue=""><option value="">(for “Move to category”)</option>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            <SubmitButton variant="secondary" className="h-9" confirm="Apply this action to the selected products?">Apply</SubmitButton>
          </div>
        )}
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr>{canWrite && <th className="w-10 px-4 py-3"><span className="sr-only">Select</span></th>}<th className="px-3 py-3">Product</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Category</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3 text-right">Stock</th><th className="px-5 py-3">Updated</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id}>
                  {canWrite && <td className="px-4 py-3"><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} className="size-4 accent-brand-600" /></td>}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? <img src={mediaSrc(p.imageUrl)} alt="" className="size-10 rounded-lg object-cover" /> : <span className="size-10 rounded-lg bg-canvas" />}
                      <span><Link href={`/products/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link><span className="block text-xs text-ink-muted">{p.brandName ?? "No brand"} · {p.variants} variant(s){p.isFeatured && " · ★ featured"}</span></span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><ProductStatusBadge status={p.status} /></td>
                  <td className="px-3 py-3 text-ink-muted">{p.categoryName}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{p.minPrice ? formatPaise(p.minPrice) : "—"}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${p.stock === 0 ? "font-semibold text-bad-700" : ""}`}>{p.stock}</td>
                  <td className="px-5 py-3 text-ink-muted">{formatDateTime(p.updatedAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-ink-muted">No products match.</td></tr>}
            </tbody>
          </table>
        </div>
      </ActionForm>
      <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">{total} product(s)</span>
        <span className="flex gap-2">{f.page > 1 && <Link href={qs(f.page - 1)} className="btn btn-secondary">← Previous</Link>}{f.page * 50 < total && <Link href={qs(f.page + 1)} className="btn btn-secondary">Next →</Link>}</span>
      </nav>
    </div>
  );
}

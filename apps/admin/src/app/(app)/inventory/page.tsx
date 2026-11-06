import Link from "next/link";
import clsx from "clsx";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { InventoryNav } from "@/components/InventoryNav";
import { catalogOptions } from "@/lib/catalog-admin";
import { formatDateTime } from "@/lib/format";
import { inventorySummary, stockLevels } from "@/lib/inventory";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Inventory" };

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = <><p className="text-sm text-ink-muted">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}</>;
  return href ? <Link href={href} className="card block p-4 hover:ring-brand-200">{body}</Link> : <div className="card p-4">{body}</div>;
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("inventory.read");
  const sp = await searchParams;
  const f = { q: sp.q?.trim().slice(0, 100) || undefined, filter: z.enum(["low", "out", "all"]).safeParse(sp.filter).data ?? "all", categoryId: z.guid().safeParse(sp.category).data };
  const [sum, rows, opts] = await Promise.all([inventorySummary(), stockLevels(f), catalogOptions()]);
  return (
    <div className="space-y-5">
      <InventoryNav active="/inventory" title="Inventory">
        {s.permissions.has("reports.export") || s.permissions.has("inventory.read") ? <a href={`/api/inventory/export?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])}`} className="btn btn-secondary">Export CSV</a> : null}
      </InventoryNav>
      <section aria-label="Inventory summary" className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active SKUs" value={sum.skus.toLocaleString("en-IN")} />
        <Stat label="Units on hand" value={sum.units.toLocaleString("en-IN")} sub={`${sum.reserved} held for unpaid checkouts`} />
        <Stat label="Value at cost" value={formatPaise(sum.valueAtCost)} sub={sum.uncosted ? `${sum.uncosted} SKU(s) have no cost yet` : "All stocked SKUs costed"} />
        <Stat label="Value at selling price" value={formatPaise(sum.valueAtPrice)} />
        <Stat label="Low / out of stock" value={`${sum.low} / ${sum.out}`} href="/inventory?filter=low" />
        <Stat label="Incoming on POs" value={sum.incoming.toLocaleString("en-IN")} href="/purchase-orders?status=open" />
      </section>
      <form className="card grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <label className="text-sm font-medium">Search<input name="q" defaultValue={f.q} placeholder="Product or SKU" className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Show<select name="filter" defaultValue={f.filter} className="input mt-1.5 h-10"><option value="all">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>
        <label className="text-sm font-medium">Category<select name="category" defaultValue={f.categoryId ?? ""} className="input mt-1.5 h-10"><option value="">All</option>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <button className="btn btn-primary h-10">Show</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Product / SKU</th><th className="px-3 py-3">Category</th><th className="px-3 py-3 text-right">On hand</th><th className="px-3 py-3 text-right">Reserved</th><th className="px-3 py-3 text-right">Alert at</th><th className="px-3 py-3 text-right">Unit cost</th><th className="px-3 py-3 text-right">Value</th><th className="px-5 py-3">Last change</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.variantId}>
                <td className="px-5 py-2.5"><Link href={`/products/${r.productId}`} className="font-semibold text-brand-700 hover:underline">{r.product}</Link>{!r.live && <span className="ml-1 text-xs text-ink-muted">(not live)</span>}<span className="block font-mono text-xs text-ink-muted">{r.sku}{Object.keys(r.options).length > 0 && ` · ${Object.values(r.options).join(" / ")}`}</span></td>
                <td className="px-3 py-2.5 text-ink-muted">{r.category}</td>
                <td className={clsx("px-3 py-2.5 text-right font-semibold tabular-nums", r.stock === 0 ? "text-bad-700" : r.stock <= r.threshold ? "text-warn-700" : "")}>{r.stock}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{r.reserved || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{r.threshold}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.costPaise !== null ? formatPaise(r.costPaise) : <span className="text-ink-subtle">—</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.costPaise !== null ? formatPaise(r.costPaise * r.stock) : "—"}</td>
                <td className="px-5 py-2.5 text-ink-muted">{formatDateTime(r.lastMovement)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-muted">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-subtle">Adjust stock on the product page (with a reason), by receiving a purchase order, or with a stock count. Reserved units are held for customers who are paying right now.</p>
    </div>
  );
}

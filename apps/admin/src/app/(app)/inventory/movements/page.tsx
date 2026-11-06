import Link from "next/link";
import { z } from "zod";
import { InventoryNav } from "@/components/InventoryNav";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock movements" };
const REASONS = ["initial", "correction", "received", "damaged", "lost", "returned_to_supplier", "customer_return", "import", "reconciliation", "other"];

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("inventory.read");
  const sp = await searchParams;
  const q = sp.q?.trim().toUpperCase().replace(/[%_\\]/g, "").slice(0, 60) || undefined;
  const reason = z.enum(REASONS as [string]).safeParse(sp.reason).data;
  const page = z.coerce.number().int().min(1).max(1000).safeParse(sp.page).data ?? 1;
  const sql = db();
  const rows = await sql<{ id: string; at: Date; sku: string; product: string; productId: string; delta: number; after: number; reason: string; note: string | null; reference: string | null; staff: string | null }[]>`
    select m.id::text, m.created_at as at, v.sku, p.name as product, p.id as "productId", m.delta, m.stock_after as after, m.reason, m.note, m.reference, u.full_name as staff
    from shop.stock_movements m join shop.product_variants v on v.id = m.variant_id join shop.products p on p.id = v.product_id left join shop.staff_users u on u.id = m.staff_id
    where true ${q ? sql`and (v.sku like ${"%" + q + "%"} or upper(coalesce(m.reference, '')) like ${"%" + q + "%"})` : sql``} ${reason ? sql`and m.reason = ${reason}` : sql``}
    order by m.id desc limit 101 offset ${(page - 1) * 100}`;
  const qs = (p: number) => "?" + new URLSearchParams(Object.entries({ q, reason, page: p > 1 ? String(p) : undefined }).filter(([, v]) => v) as [string, string][]);
  return (
    <div className="space-y-5">
      <InventoryNav active="/inventory/movements" title="Movement history" />
      <p className="text-sm text-ink-muted">Every change to stock, with who made it and why. Sales and checkout holds are tracked on orders; everything else is here.</p>
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-sm font-medium">SKU or reference<input name="q" defaultValue={q} placeholder="e.g. ZN-003 or PO-1001" className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Reason<select name="reason" defaultValue={reason ?? ""} className="input mt-1.5 h-10 w-52"><option value="">All</option>{REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</select></label>
        <button className="btn btn-primary h-10">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">When</th><th className="px-3 py-3">Item</th><th className="px-3 py-3 text-right">Change</th><th className="px-3 py-3 text-right">After</th><th className="px-3 py-3">Reason</th><th className="px-5 py-3">By</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, 100).map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-5 py-2.5 text-ink-muted">{formatDateTime(m.at)}</td>
                <td className="px-3 py-2.5"><Link href={`/products/${m.productId}`} className="text-brand-700 hover:underline">{m.product}</Link><span className="block font-mono text-xs text-ink-muted">{m.sku}</span></td>
                <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${m.delta > 0 ? "text-good-700" : "text-bad-700"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{m.after}</td>
                <td className="px-3 py-2.5">{m.reason.replace(/_/g, " ")}{m.reference && <span className="ml-1 font-mono text-xs text-ink-muted">{m.reference}</span>}{m.note && <span className="block text-xs text-ink-muted">{m.note}</span>}</td>
                <td className="px-5 py-2.5 text-ink-muted">{m.staff ?? "system"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">No movements.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex justify-between">{page > 1 ? <Link href={qs(page - 1)} className="btn btn-secondary">← Newer</Link> : <span />}{rows.length > 100 && <Link href={qs(page + 1)} className="btn btn-secondary">Older →</Link>}</nav>
    </div>
  );
}

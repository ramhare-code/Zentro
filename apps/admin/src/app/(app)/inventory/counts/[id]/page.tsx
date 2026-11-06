import { notFound } from "next/navigation";
import clsx from "clsx";
import { z } from "zod";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { InventoryNav } from "@/components/InventoryNav";
import { applyCountAction, saveCountAction } from "@/lib/actions/inventory";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock count" };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("inventory.read");
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const sql = db();
  const [c] = await sql<{ title: string; status: string; createdAt: Date; appliedAt: Date | null }[]>`select title, status, created_at as "createdAt", applied_at as "appliedAt" from shop.stock_counts where id = ${id}`;
  if (!c) notFound();
  const lines = await sql<{ variantId: string; sku: string; product: string; options: Record<string, string>; expected: number; counted: number | null; applied: number | null; current: number }[]>`
    select l.variant_id as "variantId", v.sku, p.name as product, v.options, l.expected, l.counted, l.applied_delta as applied, v.stock as current
    from shop.stock_count_lines l join shop.product_variants v on v.id = l.variant_id join shop.products p on p.id = v.product_id
    where l.count_id = ${id} order by p.name, v.sku`;
  const open = c.status === "open" && s.permissions.has("inventory.adjust");
  const diffs = lines.filter((l) => l.counted !== null && l.counted !== l.expected);
  return (
    <div className="space-y-5">
      <InventoryNav active="/inventory/counts" title={c.title} />
      <p className="text-sm text-ink-muted">Snapshot taken {formatDateTime(c.createdAt)}. {c.status === "applied" ? `Applied ${formatDateTime(c.appliedAt)}.` : c.status === "cancelled" ? "Cancelled — stock was not changed." : `${lines.filter((l) => l.counted !== null).length} of ${lines.length} counted, ${diffs.length} difference(s). Leave a line blank to skip it.`}</p>
      <ActionForm action={saveCountAction} className="card overflow-x-auto">
        <input type="hidden" name="countId" value={id} />
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Item</th><th className="px-3 py-3 text-right">Expected</th><th className="px-3 py-3 text-right">Counted</th><th className="px-3 py-3 text-right">Difference</th><th className="px-5 py-3 text-right">{c.status === "applied" ? "Applied" : "In system now"}</th></tr></thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => {
              const d = l.counted === null ? null : l.counted - l.expected;
              return (
                <tr key={l.variantId}>
                  <td className="px-5 py-2">{l.product}<span className="block font-mono text-xs text-ink-muted">{l.sku}{Object.keys(l.options).length > 0 && ` · ${Object.values(l.options).join(" / ")}`}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.expected}</td>
                  <td className="px-3 py-2 text-right">{open ? <input name={`count:${l.variantId}`} aria-label={`Counted ${l.sku}`} inputMode="numeric" defaultValue={l.counted ?? ""} className="input ml-auto h-9 w-24 text-right" /> : <span className="tabular-nums">{l.counted ?? "—"}</span>}</td>
                  <td className={clsx("px-3 py-2 text-right font-semibold tabular-nums", d ? (d > 0 ? "text-good-700" : "text-bad-700") : "text-ink-subtle")}>{d === null ? "" : d > 0 ? `+${d}` : d}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-ink-muted">{c.status === "applied" ? (l.applied ? (l.applied > 0 ? `+${l.applied}` : l.applied) : "—") : l.current}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {open && <div className="border-t border-line p-4"><SubmitButton variant="secondary">Save counts</SubmitButton></div>}
      </ActionForm>
      {/* stays mounted after applying so the result message remains visible */}
      {s.permissions.has("inventory.adjust") && (
        <ActionForm action={applyCountAction} className={open ? "card flex flex-wrap items-center gap-3 p-4" : ""}>
          <input type="hidden" name="countId" value={id} />
          {open && <>
            <p className="flex-1 text-sm text-ink-muted">Applying adjusts stock by each saved difference and logs it as a reconciliation. Save your counts first.</p>
            <SubmitButton name="op" value="apply" confirm="Apply the saved differences to stock?">Apply count</SubmitButton>
            <SubmitButton name="op" value="cancel" variant="secondary" confirm="Cancel this count without changing stock?">Cancel count</SubmitButton>
          </>}
        </ActionForm>
      )}
    </div>
  );
}

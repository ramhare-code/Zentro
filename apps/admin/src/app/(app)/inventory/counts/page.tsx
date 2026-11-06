import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { InventoryNav } from "@/components/InventoryNav";
import { startCountAction } from "@/lib/actions/inventory";
import { catalogOptions } from "@/lib/catalog-admin";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Stock counts" };

export default async function CountsPage() {
  const s = await requirePermission("inventory.read");
  const [rows, opts] = await Promise.all([
    db()<{ id: string; title: string; status: string; createdAt: Date; appliedAt: Date | null; lines: number; counted: number; diffs: number; by: string | null }[]>`
      select c.id, c.title, c.status, c.created_at as "createdAt", c.applied_at as "appliedAt", u.full_name as by,
             count(l.*)::int as lines, count(l.counted)::int as counted, count(*) filter (where l.counted is not null and l.counted <> l.expected)::int as diffs
      from shop.stock_counts c left join shop.stock_count_lines l on l.count_id = c.id left join shop.staff_users u on u.id = c.created_by
      group by c.id, u.full_name order by c.created_at desc limit 100`,
    catalogOptions(),
  ]);
  return (
    <div className="space-y-5">
      <InventoryNav active="/inventory/counts" title="Stock counts" />
      <p className="max-w-3xl text-sm text-ink-muted">Start a count to snapshot the system quantity, count the shelf, then apply. Only the difference you found is applied, so sales made while you count are not lost.</p>
      {s.permissions.has("inventory.adjust") && (
        <ActionForm action={startCountAction} className="card flex flex-wrap items-end gap-3 p-4">
          <label className="flex-1 text-sm font-medium">Title<input name="title" placeholder="e.g. Monthly count — Electronics" className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Scope<select name="categoryId" className="input mt-1.5 w-64"><option value="">All active items</option>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <SubmitButton>Start count</SubmitButton>
        </ActionForm>
      )}
      <div className="card divide-y divide-line">
        {rows.map((r) => (
          <Link key={r.id} href={`/inventory/counts/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
            <span><span className="font-semibold">{r.title}</span><span className="block text-xs text-ink-muted">Started {formatDateTime(r.createdAt)}{r.by && ` by ${r.by}`}{r.appliedAt && ` · applied ${formatDateTime(r.appliedAt)}`}</span></span>
            <span className="text-sm text-ink-muted">{r.status === "open" ? `${r.counted}/${r.lines} counted · ${r.diffs} difference(s)` : r.status === "applied" ? `Applied · ${r.diffs} correction(s)` : "Cancelled"}</span>
          </Link>
        ))}
        {rows.length === 0 && <p className="p-8 text-center text-sm text-ink-muted">No counts yet.</p>}
      </div>
    </div>
  );
}

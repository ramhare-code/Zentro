import { formatPaise, stateName } from "@zentro/commerce";
import { loadStoreSettings } from "@zentro/commerce/settings";
import { db } from "@/lib/db";
import { FinanceNav, rangeQs } from "@/components/FinanceNav";
import { gstBreakdown, type GstRow } from "@/lib/finance";
import { parseRange } from "@/lib/metrics";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "GST" };

function Table({ title, id, first, rows, keyLabel, exportHref }: { title: string; id: string; first: string; rows: GstRow[]; keyLabel: (r: GstRow) => string; exportHref?: string }) {
  const t = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, igst: a.igst + r.igst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
  return (
    <section aria-labelledby={id} className="card overflow-x-auto">
      <div className="flex items-center justify-between px-5 pt-5"><h2 id={id} className="font-semibold">{title}</h2>{exportHref && <a href={exportHref} className="text-sm font-semibold text-brand-700 underline">CSV</a>}</div>
      <table className="mt-3 w-full min-w-[44rem] text-sm">
        <thead className="border-y border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">{first}</th><th className="px-3 py-3">Supply</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Taxable value</th><th className="px-3 py-3 text-right">CGST</th><th className="px-3 py-3 text-right">SGST</th><th className="px-5 py-3 text-right">IGST</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={`${r.key}|${r.supply}|${r.gstRate}`}>
              <td className="px-5 py-2.5">{keyLabel(r)}</td><td className="px-3 py-2.5 text-ink-muted">{r.supply === "intra" ? "Intra-state" : "Inter-state"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.quantity}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(r.taxable)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(r.cgst)}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(r.sgst)}</td><td className="px-5 py-2.5 text-right tabular-nums">{formatPaise(r.igst)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-ink-muted">No invoices or credit notes in this period.</td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot className="border-t border-line font-semibold"><tr><td className="px-5 py-2.5" colSpan={3}>Total</td><td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(t.taxable)}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(t.cgst)}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(t.sgst)}</td><td className="px-5 py-2.5 text-right tabular-nums">{formatPaise(t.igst)}</td></tr></tfoot>}
      </table>
    </section>
  );
}

export default async function GstPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("finance.read");
  const range = parseRange(await searchParams);
  const [byRate, byState, byHsn] = await Promise.all([gstBreakdown(range, "rate"), gstBreakdown(range, "state"), gstBreakdown(range, "hsn")]);
  const ex = (report: string) => (s.permissions.has("finance.export") ? `/api/finance/export?report=${report}&${rangeQs(range)}` : undefined);
  const total = byRate.reduce((a, r) => a + r.cgst + r.sgst + r.igst, 0);
  const missingHsn = byHsn.some((r) => r.key === "NOT SET");
  const st = await loadStoreSettings(db());
  const configured = !!(st.gstin && st.stateCode);
  return (
    <div className="space-y-5">
      <FinanceNav active="/finance/gst" title="GST" range={range} />
      <section className="card space-y-2 p-5 text-sm">
        <p><span className="text-ink-muted">Output GST for the period, net of credit notes:</span> <strong className="text-lg tabular-nums">{formatPaise(total)}</strong></p>
        <p className="text-ink-muted">Figures are B2C outward supplies (all sales are to consumers), recognised on invoice and credit-note dates. Use them to prepare GSTR-1 (Table 7 / B2CS, Table 12 / HSN) and GSTR-3B. Zentro doesn’t file returns — review with your accountant.</p>
        {!configured && <p className="font-semibold text-warn-700">Your GSTIN and state aren’t set in Settings, so intra/inter-state classification falls back to whether IGST was charged.</p>}
        {missingHsn && <p className="font-semibold text-warn-700">Some products have no HSN code. Add them on the product page — HSN is required on invoices and in GSTR-1.</p>}
      </section>
      <Table id="rate" title="By tax rate" first="GST rate" rows={byRate} keyLabel={(r) => `${Number(r.key)}%`} exportHref={ex("gst-rate")} />
      <Table id="state" title="By place of supply (B2CS)" first="State · rate" rows={byState} keyLabel={(r) => `${stateName(r.key)} (${r.key}) · ${Number(r.gstRate)}%`} exportHref={ex("gst-state")} />
      <Table id="hsn" title="HSN summary" first="HSN · rate" rows={byHsn} keyLabel={(r) => `${r.key === "SHIPPING" ? "Shipping (with goods)" : r.key} · ${Number(r.gstRate)}%`} exportHref={ex("hsn")} />
    </div>
  );
}

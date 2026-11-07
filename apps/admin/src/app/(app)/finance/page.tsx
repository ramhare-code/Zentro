import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { FinanceNav, rangeQs } from "@/components/FinanceNav";
import { ProfitChart } from "@/components/finance/ProfitChart";
import { productProfit, profitSeries, profitTotals } from "@/lib/finance";
import { parseRange } from "@/lib/metrics";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Finance" };

function Line({ label, value, strong, minus, note }: { label: string; value: number; strong?: boolean; minus?: boolean; note?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt>{label}{note && <span className="block text-xs font-normal text-ink-muted">{note}</span>}</dt>
      <dd className={`tabular-nums ${value < 0 && strong ? "text-bad-700" : ""}`}>{minus && value !== 0 ? "− " : ""}{formatPaise(Math.abs(value))}{value < 0 && !minus ? " loss" : ""}</dd>
    </div>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("finance.read");
  const range = parseRange(await searchParams);
  const [t, series, products] = await Promise.all([profitTotals(range), profitSeries(range), productProfit(range)]);
  const cogsNet = t.cogsPaise - t.cogsReversedPaise;
  const revenue = t.netSalesPaise - t.creditNetPaise;
  const canExport = s.permissions.has("finance.export");
  return (
    <div className="space-y-5">
      <FinanceNav active="/finance" title="Finance" range={range} exportHref={canExport ? `/api/finance/export?report=profit&${rangeQs(range)}` : undefined} />
      {(t.uncostedUnits > 0 || t.feesMissing > 0 || (t.shippingPaise > 0 && t.untaxedShippingPaise > 0)) && (
        <section aria-label="Data notes" className="card space-y-1 border-l-4 border-warn-500 p-4 text-sm">
          {t.uncostedUnits > 0 && <p><strong>{t.uncostedUnits} unit(s) sold have no cost price,</strong> so their cost is counted as ₹0 and profit is overstated. Costs are recorded when you <Link href="/purchase-orders" className="underline">receive a purchase order</Link>.</p>}
          {t.feesMissing > 0 && <p><strong>{t.feesMissing} payment(s) have no Razorpay fee yet.</strong> Fees arrive with a <Link href="/payments/reconcile" className="underline">gateway check or settlement import</Link>.</p>}
          {t.untaxedShippingPaise > 0 && <p>Shipping charges of {formatPaise(t.untaxedShippingPaise)} were collected <strong>without GST</strong>. Delivery charged with goods is usually taxable at the goods’ rate — confirm with your accountant and switch it on in <Link href="/settings/tax" className="underline">Settings → Tax</Link>.</p>}
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <section aria-labelledby="pl" className="card p-5 text-sm">
          <h2 id="pl" className="font-semibold">Profit summary</h2>
          <p className="text-xs text-ink-muted">{range.from} to {range.to} · {t.invoices} invoice(s), {t.creditNotes} credit note(s)</p>
          <dl className="mt-3 divide-y divide-line">
            <Line label="Sales incl. GST" value={t.grossPaise} note={`after ${formatPaise(t.discountPaise)} discounts; includes ${formatPaise(t.shippingPaise)} shipping`} />
            <Line label="GST collected" value={t.gstPaise} minus />
            <Line label="Net sales" value={t.netSalesPaise} strong />
            <Line label="Returns & cancellations" value={t.creditNetPaise} minus note="credit notes, ex-GST" />
            <Line label="Net revenue" value={revenue} strong />
            <Line label="Cost of goods sold" value={cogsNet} minus note={t.cogsReversedPaise ? `${formatPaise(t.cogsReversedPaise)} returned to stock` : "at purchase cost"} />
            <Line label="Payment gateway fees" value={t.feesExGstPaise} minus note={t.feeGstPaise ? `ex-GST; ${formatPaise(t.feeGstPaise)} GST on fees is claimable input credit` : undefined} />
            <Line label="Gross profit" value={t.grossProfitPaise} strong />
          </dl>
          <p className="mt-2 text-xs text-ink-muted">Margin {t.marginPct === null ? "—" : `${t.marginPct}%`} of net revenue. Excludes costs Zentro doesn’t know: courier bills, packaging, ads, salaries, rent.</p>
        </section>
        <section aria-labelledby="trend" className="card p-5">
          <h2 id="trend" className="font-semibold">By {range.bucket}</h2>
          <div className="mt-3"><ProfitChart monthly={range.bucket === "month"} data={series.map((b) => ({ bucket: b.bucket, revenuePaise: b.netSalesPaise - b.creditNetPaise, profitPaise: b.profitPaise }))} /></div>
        </section>
      </div>
      <section aria-labelledby="products" className="card overflow-x-auto">
        <h2 id="products" className="px-5 pt-5 font-semibold">Profit by product</h2>
        <table className="mt-3 w-full min-w-[44rem] text-sm">
          <thead className="border-y border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Product</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Returned</th><th className="px-3 py-3 text-right">Net sales</th><th className="px-3 py-3 text-right">Cost</th><th className="px-3 py-3 text-right">Profit</th><th className="px-5 py-3 text-right">Margin</th></tr></thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => (
              <tr key={p.productId ?? p.name}>
                <td className="px-5 py-2.5">{p.productId ? <Link href={`/products/${p.productId}`} className="text-brand-700 hover:underline">{p.name}</Link> : p.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.units}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{p.returned || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(p.netSalesPaise)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.costPaise === null ? <span className="text-warn-700">unknown</span> : formatPaise(p.costPaise)}</td>
                <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${p.profitPaise !== null && p.profitPaise < 0 ? "text-bad-700" : ""}`}>{p.profitPaise === null ? "—" : formatPaise(p.profitPaise)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{p.marginPct === null ? "—" : `${p.marginPct}%`}</td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-ink-muted">No invoiced sales in this period.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

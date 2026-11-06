import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { FinanceNav, rangeQs } from "@/components/FinanceNav";
import { creditNoteRegister, invoiceRegister } from "@/lib/finance";
import { formatDateTime } from "@/lib/format";
import { parseRange } from "@/lib/metrics";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Invoices & credit notes" };

export default async function RegistersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("finance.read");
  const range = parseRange(await searchParams);
  const [invoices, notes] = await Promise.all([invoiceRegister(range, 500), creditNoteRegister(range, 500)]);
  const canExport = s.permissions.has("finance.export");
  const th = "px-3 py-3 text-right";
  const td = "px-3 py-2.5 text-right tabular-nums";
  return (
    <div className="space-y-5">
      <FinanceNav active="/finance/registers" title="Invoices & credit notes" range={range} />
      <section aria-labelledby="inv" className="card overflow-x-auto">
        <div className="flex items-center justify-between px-5 pt-5"><h2 id="inv" className="font-semibold">Invoice register ({invoices.length}{invoices.length === 500 && "+"})</h2>{canExport && <a href={`/api/finance/export?report=invoices&${rangeQs(range)}`} className="text-sm font-semibold text-brand-700 underline">CSV</a>}</div>
        <table className="mt-3 w-full min-w-[60rem] text-sm">
          <thead className="border-y border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Invoice</th><th className="px-3 py-3">Order</th><th className="px-3 py-3">State</th><th className={th}>Taxable</th><th className={th}>CGST</th><th className={th}>SGST</th><th className={th}>IGST</th><th className={th}>Shipping</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-line">
            {invoices.map((i) => (
              <tr key={i.number}>
                <td className="px-5 py-2.5"><span className="font-mono">{i.number}</span><span className="block text-xs text-ink-muted">{formatDateTime(i.issuedAt)}</span></td>
                <td className="px-3 py-2.5"><Link href={`/orders/${i.orderId}`} className="font-mono text-brand-700 hover:underline">{i.orderNumber}</Link>{["cancelled", "returned"].includes(i.status) && <span className="ml-1 text-xs text-ink-muted">({i.status})</span>}</td>
                <td className="px-3 py-2.5">{i.pos}</td>
                <td className={td}>{formatPaise(i.taxable)}</td><td className={td}>{formatPaise(i.cgst)}</td><td className={td}>{formatPaise(i.sgst)}</td><td className={td}>{formatPaise(i.igst)}</td><td className={td}>{formatPaise(i.shipping)}</td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{formatPaise(i.total)}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-ink-muted">No invoices in this period.</td></tr>}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="cn" className="card overflow-x-auto">
        <div className="flex items-center justify-between px-5 pt-5"><h2 id="cn" className="font-semibold">Credit notes ({notes.length})</h2>{canExport && <a href={`/api/finance/export?report=credit-notes&${rangeQs(range)}`} className="text-sm font-semibold text-brand-700 underline">CSV</a>}</div>
        <p className="px-5 text-xs text-ink-muted">Issued automatically when a refund for returned goods or a cancelled, invoiced order is processed. Refunds of duplicate payments don’t reverse a sale, so they don’t get one.</p>
        <table className="mt-3 w-full min-w-[60rem] text-sm">
          <thead className="border-y border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Credit note</th><th className="px-3 py-3">Against invoice</th><th className="px-3 py-3">Reason</th><th className={th}>Taxable</th><th className={th}>CGST</th><th className={th}>SGST</th><th className={th}>IGST</th><th className={th}>Other</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-line">
            {notes.map((c) => (
              <tr key={c.number}>
                <td className="px-5 py-2.5"><span className="font-mono">{c.number}</span><span className="block text-xs text-ink-muted">{formatDateTime(c.issuedAt)}</span></td>
                <td className="px-3 py-2.5"><span className="font-mono">{c.invoiceNumber}</span><Link href={`/orders/${c.orderId}`} className="block font-mono text-xs text-brand-700 hover:underline">{c.orderNumber}</Link></td>
                <td className="px-3 py-2.5">{c.reason}</td>
                <td className={td}>{formatPaise(c.taxable)}</td><td className={td}>{formatPaise(c.cgst)}</td><td className={td}>{formatPaise(c.sgst)}</td><td className={td}>{formatPaise(c.igst)}</td><td className={td}>{formatPaise(c.other)}</td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{formatPaise(c.total)}</td>
              </tr>
            ))}
            {notes.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-ink-muted">No credit notes in this period.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

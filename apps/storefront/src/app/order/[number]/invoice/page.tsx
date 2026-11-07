import type { Metadata } from "next";
import { formatPaise, stateName } from "@zentro/commerce";
import { findOrderForGuest } from "@zentro/commerce/orders";
import { db } from "@/lib/db";
import { getBusiness } from "@/lib/settings";
import { getOrderView } from "@/lib/order-view";
import { PrintButton } from "@/components/order/PrintButton";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const d = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const { number } = await params;
  const { t } = await searchParams;
  const id = t ? await findOrderForGuest(db(), number, t) : null;
  const o = id ? await getOrderView(id) : null;
  if (!o || !o.invoiceNumber) return <p className="container-page py-16 text-center">Invoice not available.</p>;
  // invoices issued after settings moved to the database carry a frozen copy of the seller's details
  const current = await getBusiness();
  const b = o.invoiceSeller ? { name: o.invoiceSeller.name, legalName: o.invoiceSeller.legalName ?? undefined, address: o.invoiceSeller.address ?? undefined, gstin: o.invoiceSeller.gstin ?? undefined } : current;
  // A GST tax invoice needs the seller's legal name, address and GSTIN. Without them we issue a receipt.
  const isTaxInvoice = !!(b.legalName && b.address && b.gstin);
  const intra = o.items.some((i) => i.cgstPaise > 0);
  const sum = (k: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise") => o.items.reduce((a, i) => a + i[k], 0);

  return (
    <div className="container-page max-w-4xl py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <article className="rounded-card bg-white p-8 text-sm ring-1 ring-line print:ring-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold">{isTaxInvoice ? "Tax Invoice" : "Order Receipt"}</h1>
            <p className="mt-1">No. {o.invoiceNumber} · {d.format(o.invoiceDate!)}</p>
            <p>Order {o.orderNumber}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{b.legalName ?? b.name}</p>
            {b.address && <p className="whitespace-pre-line text-ink-muted">{b.address}</p>}
            {b.gstin && <p>GSTIN {b.gstin}</p>}
          </div>
        </header>
        <section className="grid gap-4 border-b border-line py-5 sm:grid-cols-2">
          <div><p className="font-semibold">Billed & shipped to</p><p className="text-ink-muted">{o.address.fullName}<br />{o.address.line1}{o.address.line2 && `, ${o.address.line2}`}<br />{o.address.city}, {stateName(o.address.stateCode)} {o.address.pincode}</p></div>
          <div className="sm:text-right"><p className="font-semibold">Place of supply</p><p className="text-ink-muted">{stateName(o.placeOfSupply)} ({o.placeOfSupply})</p></div>
        </section>
        <table className="mt-5 w-full">
          <thead className="text-left text-xs uppercase text-ink-muted">
            <tr><th className="py-2">Item</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Taxable</th><th className="text-right">GST</th>{intra ? <><th className="text-right">CGST</th><th className="text-right">SGST</th></> : <th className="text-right">IGST</th>}<th className="text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {o.items.map((i) => (
              <tr key={i.id}>
                <td className="py-2">{i.productName}{i.variantLabel && ` (${i.variantLabel})`}<br /><span className="text-xs text-ink-muted">SKU {i.sku}</span></td>
                <td>{i.hsnCode ?? "—"}</td><td className="text-right">{i.quantity}</td>
                <td className="text-right">{formatPaise(i.taxablePaise)}</td><td className="text-right">{Number(i.gstRate)}%</td>
                {intra ? <><td className="text-right">{formatPaise(i.cgstPaise)}</td><td className="text-right">{formatPaise(i.sgstPaise)}</td></> : <td className="text-right">{formatPaise(i.igstPaise)}</td>}
                <td className="text-right">{formatPaise(i.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-line font-semibold">
            <tr><td className="py-2" colSpan={3}>Items total</td><td className="text-right">{formatPaise(sum("taxablePaise"))}</td><td />
              {intra ? <><td className="text-right">{formatPaise(sum("cgstPaise"))}</td><td className="text-right">{formatPaise(sum("sgstPaise"))}</td></> : <td className="text-right">{formatPaise(sum("igstPaise"))}</td>}
              <td className="text-right">{formatPaise(o.subtotalPaise - o.discountPaise)}</td></tr>
          </tfoot>
        </table>
        <dl className="ml-auto mt-4 w-64 space-y-1">
          {o.discountPaise > 0 && <div className="flex justify-between"><dt>Coupon discount</dt><dd>−{formatPaise(o.discountPaise)}</dd></div>}
          <div className="flex justify-between"><dt>Delivery</dt><dd>{formatPaise(o.shippingPaise)}</dd></div>
          {o.shippingTax.taxablePaise > 0 && (
            <div className="flex justify-between text-xs text-ink-muted"><dt>incl. GST {Number(o.shippingTax.gstRate)}% on delivery</dt>
              <dd>{formatPaise(o.shippingTax.cgstPaise + o.shippingTax.sgstPaise + o.shippingTax.igstPaise)}</dd></div>
          )}
          <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>Amount paid</dt><dd>{formatPaise(o.totalPaise)}</dd></div>
        </dl>
        {!isTaxInvoice && <p className="mt-6 text-xs text-ink-muted">This is a payment receipt. A GST tax invoice will be available once the seller’s GST details are configured.</p>}
        <p className="mt-6 text-xs text-ink-muted">This is a computer-generated document.</p>
      </article>
    </div>
  );
}

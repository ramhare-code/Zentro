import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { formatPaise, ORDER_STATUS_LABELS, stateName, type OrderStatus } from "@zentro/commerce";
import { findOrderForGuest } from "@zentro/commerce/orders";
import { OrderActions } from "@/components/order/OrderActions";
import { ReviewForm } from "@/components/engage/ReviewForm";
import { ReturnRequest } from "@/components/order/ReturnRequest";
import { RETURN_REASONS, RETURN_STATUS_LABELS } from "@zentro/commerce/orders";
import { db } from "@/lib/db";
import { getOrderView } from "@/lib/order-view";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STEPS: OrderStatus[] = ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const d = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const PAYMENT_LABEL: Record<string, string> = { pending: "Awaiting payment", paid: "Paid", failed: "Payment failed", refund_pending: "Refund in progress", partially_refunded: "Partially refunded", refunded: "Refunded" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; placed?: string }> }) {
  const { number } = await params;
  const { t, placed } = await searchParams;
  const orderId = t ? await findOrderForGuest(db(), number, t) : null;
  const o = orderId ? await getOrderView(orderId) : null;
  if (!o || !t) {
    return (
      <div className="container-page max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-bold">We couldn’t open this order</h1>
        <p className="mt-2 text-ink-muted">The link may be incomplete or out of date. Look it up with your order number, email and mobile number.</p>
        <Link href="/account/orders" className="mt-6 inline-flex h-11 items-center rounded-full bg-brand-600 px-6 font-semibold text-white">Find my order</Link>
      </div>
    );
  }
  const stepIndex = STEPS.indexOf(o.status);
  const cancelled = o.status === "cancelled";
  const canCancel = ["pending_payment", "payment_failed", "confirmed", "processing"].includes(o.status);
  const canPay = o.reservationOpen;
  const windowDays = Number(process.env.RETURN_WINDOW_DAYS) || 7;
  const returnDeadline = o.deliveredAt ? new Date(o.deliveredAt.getTime() + windowDays * 86_400_000) : null;
  const canReturn = ["delivered", "return_requested"].includes(o.status) && !!returnDeadline && returnDeadline > new Date() && o.returnable.length > 0;

  return (
    <div className="container-page max-w-5xl py-8">
      {placed && o.paymentStatus === "paid" && (
        <div role="status" className="mb-6 rounded-card bg-success-50 p-5 text-success-700 ring-1 ring-success-700/20">
          <p className="font-display text-xl font-bold">Thank you — your order is confirmed!</p>
          <p className="mt-1 text-sm">A confirmation has been queued to {o.email}. Bookmark this page to track your order.</p>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">Order</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{o.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-muted">Placed {dt.format(o.placedAt ?? o.createdAt)} · {PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus}</p>
        </div>
        {o.invoiceNumber && <Link href={`/order/${o.orderNumber}/invoice?t=${encodeURIComponent(t)}`} className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-line-strong hover:bg-canvas">Download invoice</Link>}
      </div>

      <section aria-label="Order status" className="mt-6 rounded-card bg-white p-5 ring-1 ring-line sm:p-6">
        {cancelled ? (
          <div><p className="font-semibold text-danger-700">Cancelled</p>{o.cancelReason && <p className="mt-1 text-sm text-ink-muted">{o.cancelReason}</p>}</div>
        ) : o.status === "pending_payment" || o.status === "payment_failed" ? (
          <div><p className="font-semibold text-warning-700">{ORDER_STATUS_LABELS[o.status]}</p><p className="mt-1 text-sm text-ink-muted">{canPay ? "Your items are reserved for a short time. Complete payment to confirm the order." : "The payment window has closed."}</p></div>
        ) : (
          <>
            <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">
              {STEPS.map((s, i) => (
                <li key={s} className="flex flex-col items-center text-center">
                  <span aria-hidden className={clsx("grid size-8 place-items-center rounded-full text-xs font-bold", i <= stepIndex ? "bg-brand-600 text-white" : "bg-canvas text-ink-subtle ring-1 ring-line")}>{i <= stepIndex ? "✓" : i + 1}</span>
                  <span className={clsx("mt-1.5 text-xs", i <= stepIndex ? "font-semibold text-ink" : "text-ink-muted")}>{ORDER_STATUS_LABELS[s]}{i === stepIndex && <span className="sr-only"> (current)</span>}</span>
                </li>
              ))}
            </ol>
            {o.status !== "delivered" && o.estFrom && o.estTo && <p className="mt-4 text-center text-sm text-ink-muted">Estimated delivery {d.format(new Date(o.estFrom))} – {d.format(new Date(o.estTo))}</p>}
          </>
        )}
        {o.shipments.map((s, i) => (
          <div key={i} className="mt-5 rounded-xl bg-canvas p-4 text-sm">
            <p className="font-semibold">Shipped with {s.carrier}{s.trackingNumber && <> · Tracking {s.trackingNumber}</>}</p>
            {s.trackingUrl && <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Track on carrier website</a>}
            {s.events.length > 0 && (
              <ul className="mt-3 space-y-1.5">{s.events.map((e, j) => <li key={j} className="text-ink-muted">{dt.format(new Date(e.occurredAt))} — {e.description ?? e.status.replace(/_/g, " ")}{e.location && `, ${e.location}`}</li>)}</ul>
            )}
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-card bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="items-h">
          <h2 id="items-h" className="font-display text-lg font-bold">Items</h2>
          <ul className="mt-3 divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.id} className="flex gap-4 py-3">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-brand-50">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="64px" className="object-cover" />}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {i.productSlug ? <Link href={`/p/${i.productSlug}`} className="font-semibold hover:text-brand-700">{i.productName}</Link> : <span className="font-semibold">{i.productName}</span>}
                  {i.variantLabel && <span className="block text-ink-muted">{i.variantLabel}</span>}
                  <span className="block text-ink-muted">Qty {i.quantity} × {formatPaise(i.unitPricePaise)}</span>
                  {o.status === "delivered" && i.productSlug && (
                    <ReviewForm reviewed={i.reviewed} orderNumber={o.orderNumber} token={t} orderItemId={i.id} productName={i.productName} defaultName={`${o.address.fullName.split(" ")[0]} ${(o.address.fullName.split(" ")[1] ?? "").slice(0, 1)}`.trim()} />)}
                </span>
                <span className="text-sm font-semibold">{formatPaise(i.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPaise(o.subtotalPaise)}</dd></div>
            {o.discountPaise > 0 && <div className="flex justify-between text-success-700"><dt>Coupon {o.couponCode}</dt><dd>−{formatPaise(o.discountPaise)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery</dt><dd>{o.shippingPaise ? formatPaise(o.shippingPaise) : "Free"}</dd></div>
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatPaise(o.totalPaise)}</dd></div>
            <div className="flex justify-between text-xs text-ink-muted"><dt>Includes GST</dt><dd>{formatPaise(o.taxPaise)}</dd></div>
          </dl>
          {o.refunds.length > 0 && (
            <div className="mt-4 rounded-xl bg-canvas p-4 text-sm">
              <p className="font-semibold">Refunds</p>
              <ul className="mt-1 space-y-1">{o.refunds.map((r, i) => <li key={i}>{formatPaise(r.amountPaise)} — {r.status === "processed" ? `refunded on ${d.format(r.processedAt!)}` : r.status === "failed" ? "failed; our team will contact you" : "in progress with your bank (5–7 working days)"}</li>)}</ul>
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <section className="rounded-card bg-white p-5 text-sm ring-1 ring-line" aria-labelledby="ship-h">
            <h2 id="ship-h" className="font-semibold">Delivery address</h2>
            <address className="mt-2 not-italic text-ink-muted">
              <span className="font-medium text-ink">{o.address.fullName}</span><br />
              {o.address.line1}{o.address.line2 && <>, {o.address.line2}</>}<br />
              {o.address.landmark && <>{o.address.landmark}<br /></>}
              {o.address.city}, {stateName(o.address.stateCode)} {o.address.pincode}<br />
              {o.address.phone}
            </address>
          </section>
          <OrderActions orderNumber={o.orderNumber} token={t} canCancel={canCancel} canPay={canPay} />
          {o.returns.map((r) => (
            <section key={r.id} className="rounded-card bg-white p-5 text-sm ring-1 ring-line" aria-label="Return">
              <p className="font-semibold">Return: {RETURN_STATUS_LABELS[r.status] ?? r.status}</p>
              <p className="mt-1 text-ink-muted">{r.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")} · {RETURN_REASONS[r.reason as keyof typeof RETURN_REASONS] ?? r.reason}</p>
              {r.note && <p className="mt-2 rounded-lg bg-canvas p-2">{r.note}</p>}
            </section>
          ))}
          {canReturn && <ReturnRequest orderNumber={o.orderNumber} token={t} items={o.returnable} deadline={d.format(returnDeadline!)} />}
          <p className="text-center text-sm"><Link href={`/support/new?order=${o.orderNumber}`} className="font-semibold text-brand-700 hover:underline">Need help with this order?</Link></p>
        </aside>
      </div>
    </div>
  );
}

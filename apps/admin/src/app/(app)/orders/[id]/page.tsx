import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise, ORDER_STATUS_LABELS, ORDER_TRANSITIONS, stateName } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { PaymentLabel, StatusBadge } from "@/components/StatusBadge";
import { shiprocketConfigFromEnv } from "@zentro/commerce/shipping";
import { bookCourierAction, syncTrackingAction } from "@/lib/actions/courier";
import { addOrderNoteAction, advanceOrderAction, cancelOrderAdminAction } from "@/lib/actions/orders";
import { returnAction } from "@/lib/actions/returns";
import { RETURN_REASONS, RETURN_STATUS_LABELS } from "@zentro/commerce/orders";
import { formatDateTime } from "@/lib/format";
import { maskEmail, maskPhone } from "@/lib/mask";
import { getOrderDetail } from "@/lib/orders";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Order" };

const NEXT_LABEL: Record<string, string> = { processing: "Start processing", packed: "Mark packed", shipped: "Mark shipped", out_for_delivery: "Out for delivery", delivered: "Mark delivered" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("orders.read");
  const id = z.guid().safeParse((await params).id).data;
  const o = id ? await getOrderDetail(id) : null;
  if (!o) notFound();
  const pii = s.permissions.has("customers.pii");
  const courierReady = !!shiprocketConfigFromEnv();
  const forward = ORDER_TRANSITIONS[o.status].filter((t) => t !== "cancelled" && t !== "return_requested" && t !== "payment_failed" && t !== "confirmed");
  const canCancel = s.permissions.has("orders.cancel") && (ORDER_TRANSITIONS[o.status].includes("cancelled") || o.status === "pending_payment" || o.status === "payment_failed");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/orders" className="text-sm font-semibold text-brand-700 hover:underline">← Orders</Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{o.orderNumber}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted"><StatusBadge status={o.status} /> <PaymentLabel status={o.paymentStatus} /> · Created {formatDateTime(o.createdAt)}{o.invoiceNumber && <> · Invoice {o.invoiceNumber}</>}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {s.permissions.has("orders.update") && (forward.length > 0 || o.status === "delivered") && (
            <section className="card p-5" aria-labelledby="fulfil-h">
              <h2 id="fulfil-h" className="font-semibold">Fulfilment</h2>
              {forward.length === 0 && <p className="mt-2 text-sm text-ink-muted">Delivered — no further steps.</p>}
              <ActionForm action={advanceOrderAction} className="mt-4">
                <input type="hidden" name="orderId" value={o.id} />
                {forward.includes("shipped") && (
                  <div className="mb-4 grid gap-3 rounded-xl bg-canvas p-4 sm:grid-cols-3">
                    <label className="text-sm font-medium">Carrier<input name="carrier" maxLength={80} placeholder="e.g. Delhivery, Blue Dart" className="input mt-1 h-10" /></label>
                    <label className="text-sm font-medium">Tracking / AWB number<input name="trackingNumber" maxLength={60} className="input mt-1 h-10" /></label>
                    <label className="text-sm font-medium">Tracking link<input name="trackingUrl" type="url" maxLength={300} placeholder="https://" className="input mt-1 h-10" /></label>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {forward.map((to) => <SubmitButton key={to} name="to" value={to}>{NEXT_LABEL[to] ?? ORDER_STATUS_LABELS[to]}</SubmitButton>)}
                </div>
                {forward.some((t) => ["shipped", "out_for_delivery", "delivered"].includes(t)) && <p className="mt-2 text-xs text-ink-muted">Shipped, out-for-delivery and delivered updates notify the customer.</p>}
              </ActionForm>
            </section>
          )}

          {s.permissions.has("orders.update") && o.paymentStatus === "paid" && (["processing", "packed", "shipped", "out_for_delivery"].includes(o.status) || o.shipments.length > 0) && (
            <section className="card space-y-4 p-5" aria-labelledby="courier-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="courier-h" className="font-semibold">Courier & label</h2>
                {pii && <Link href={`/orders/${o.id}/label`} className="btn btn-secondary h-9">Print label & packing slip</Link>}
              </div>
              {/* stays mounted after booking so the result stays visible */}
              <ActionForm action={bookCourierAction} className={o.status === "packed" && courierReady ? "space-y-3" : ""}>
                <input type="hidden" name="orderId" value={o.id} />
                {o.status === "packed" && courierReady && !o.shipments.some((sh) => sh.provider === "shiprocket" && sh.status !== "returned_to_origin") && (
                  <>
                    <p className="text-sm text-ink-muted">Book a pickup with Shiprocket: it assigns a courier and AWB, marks the order shipped and tells the customer.</p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <label className="text-sm font-medium">Weight (kg)<input name="weightKg" inputMode="decimal" required defaultValue={o.weightGrams ? (o.weightGrams / 1000).toFixed(2) : "0.50"} className="input mt-1 h-10" /></label>
                      <label className="text-sm font-medium">Length (cm)<input name="lengthCm" inputMode="decimal" required defaultValue="20" className="input mt-1 h-10" /></label>
                      <label className="text-sm font-medium">Width (cm)<input name="breadthCm" inputMode="decimal" required defaultValue="15" className="input mt-1 h-10" /></label>
                      <label className="text-sm font-medium">Height (cm)<input name="heightCm" inputMode="decimal" required defaultValue="10" className="input mt-1 h-10" /></label>
                    </div>
                    <SubmitButton>Book courier</SubmitButton>
                  </>
                )}
              </ActionForm>
              {o.status === "packed" && !courierReady && <p className="text-xs text-ink-muted">Courier booking needs a Shiprocket account (see docs/OPERATIONS.md). Until then, ship with any courier and enter the tracking number in Fulfilment.</p>}
              {o.shipments.map((sh) => (
                <div key={sh.id} className="rounded-xl bg-canvas p-4 text-sm">
                  <p className="font-semibold">{sh.carrier}{sh.trackingNumber && <span className="font-mono"> · AWB {sh.trackingNumber}</span>} · {sh.status.replace(/_/g, " ")}</p>
                  <p className="mt-1 flex flex-wrap gap-3 text-xs">{sh.trackingUrl && <a href={sh.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Tracking page</a>}{sh.labelUrl && <a href={sh.labelUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Courier label (PDF)</a>}{sh.lastSyncedAt && <span className="text-ink-muted">Synced {formatDateTime(sh.lastSyncedAt)}</span>}</p>
                  {sh.events.length > 0 && <ol aria-label="Tracking history" className="mt-2 space-y-1 border-l-2 border-line pl-3 text-xs">{sh.events.slice(0, 8).map((e, i) => <li key={i}><span className="font-semibold">{e.status}</span>{e.location && ` · ${e.location}`} <span className="text-ink-muted">· {formatDateTime(e.at)}</span></li>)}</ol>}
                  {sh.provider === "shiprocket" && courierReady && <ActionForm action={syncTrackingAction} className="mt-2"><input type="hidden" name="orderId" value={o.id} />{!sh.deliveredAt && <SubmitButton variant="secondary" className="h-8 px-3">Sync tracking now</SubmitButton>}</ActionForm>}
                </div>
              ))}
            </section>
          )}

          <section className="card p-5" aria-labelledby="items-h">
            <h2 id="items-h" className="font-semibold">Items</h2>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-line">
                {o.items.map((i) => (
                  <tr key={i.id}><td className="py-2.5">{i.productName}{i.variantLabel && <span className="text-ink-muted"> · {i.variantLabel}</span>}<span className="block font-mono text-xs text-ink-muted">{i.sku}</span></td>
                    <td className="py-2.5 text-right">{i.quantity} × {formatPaise(i.unitPricePaise)}</td><td className="py-2.5 text-right font-semibold">{formatPaise(i.lineTotalPaise)}</td></tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto mt-3 w-72 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPaise(o.subtotalPaise)}</dd></div>
              {o.discountPaise > 0 && <div className="flex justify-between"><dt>Coupon {o.couponCode}</dt><dd>−{formatPaise(o.discountPaise)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd>{formatPaise(o.shippingPaise)}</dd></div>
              <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatPaise(o.totalPaise)}</dd></div>
              <div className="flex justify-between text-xs text-ink-muted"><dt>GST included ({stateName(o.placeOfSupply)})</dt><dd>{formatPaise(o.taxPaise)}</dd></div>
            </dl>
          </section>

          {o.returns.map((r) => (
            <section key={r.id} className="card p-5" aria-label="Return request">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Return · {RETURN_STATUS_LABELS[r.status] ?? r.status}</h2>
                <span className="text-xs text-ink-muted">{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm">{r.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
              <p className="text-sm text-ink-muted">Reason: {RETURN_REASONS[r.reason as keyof typeof RETURN_REASONS] ?? r.reason}{r.details && ` — “${r.details}”`}</p>
              {r.note && <p className="mt-2 rounded-lg bg-canvas p-2 text-sm">Note to customer: {r.note}</p>}
              {(s.permissions.has("orders.update") || s.permissions.has("refunds.create")) && (
                <ActionForm action={returnAction} className="mt-3 space-y-2">
                  <input type="hidden" name="returnId" value={r.id} />
                  {["requested", "approved", "pickup_scheduled", "picked_up"].includes(r.status) && <input name="note" maxLength={500} placeholder="Note for the customer (required to reject)" className="input h-10 text-sm" />}
                  <div className="flex flex-wrap gap-2">
                    {r.status === "requested" && s.permissions.has("orders.update") && <><SubmitButton name="op" value="approved">Approve</SubmitButton><SubmitButton name="op" value="rejected" variant="danger">Reject</SubmitButton></>}
                    {r.status === "approved" && s.permissions.has("orders.update") && <SubmitButton name="op" value="pickup_scheduled" variant="secondary">Pickup scheduled</SubmitButton>}
                    {["approved", "pickup_scheduled"].includes(r.status) && s.permissions.has("orders.update") && <SubmitButton name="op" value="picked_up" variant="secondary">Picked up</SubmitButton>}
                    {["approved", "pickup_scheduled", "picked_up"].includes(r.status) && s.permissions.has("refunds.create") && <SubmitButton name="op" value="receive" confirm="Mark items received, restock them and refund the customer?">Received & refund</SubmitButton>}
                  </div>
                </ActionForm>
              )}
            </section>
          ))}

          <section className="card p-5" aria-labelledby="pay-h">
            <h2 id="pay-h" className="font-semibold">Payments & refunds</h2>
            {o.payments.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No payment attempts.</p> : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {o.payments.map((p) => (
                  <li key={p.providerOrderId} className="py-2.5">
                    <span className="font-semibold">{formatPaise(p.amountPaise)}</span> · {p.status}{p.method && ` · ${p.method}`}
                    <span className="block font-mono text-xs text-ink-muted">{p.providerOrderId}{p.providerPaymentId && ` / ${p.providerPaymentId}`}</span>
                    {p.verifiedAt && <span className="block text-xs text-good-700">Verified with Razorpay {formatDateTime(p.verifiedAt)}</span>}
                    {p.errorDescription && <span className="block text-xs text-bad-700">{p.errorDescription}</span>}
                  </li>
                ))}
              </ul>
            )}
            {o.refunds.map((r, i) => <p key={i} className="mt-2 text-sm">Refund {formatPaise(r.amountPaise)} — <strong>{r.status}</strong>{r.providerRefundId && <span className="font-mono text-xs text-ink-muted"> {r.providerRefundId}</span>}</p>)}
          </section>

          <section className="card p-5" aria-labelledby="hist-h">
            <h2 id="hist-h" className="font-semibold">History</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {o.events.map((e, i) => <li key={i}><span className="font-medium">{e.status.replace(/_/g, " ")}</span> <span className="text-ink-muted">· {e.actor} · {formatDateTime(e.createdAt)}</span>{e.note && <span className="block text-ink-muted">{e.note}</span>}</li>)}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5 text-sm" aria-labelledby="cust-h">
            <h2 id="cust-h" className="font-semibold">Customer & delivery</h2>
            <p className="mt-2">{pii ? o.email : maskEmail(o.email)}<br />{pii ? o.phone : maskPhone(o.phone)}{o.whatsapp && <span className="ml-1 text-xs text-good-700">(WhatsApp updates on)</span>}</p>
            <address className="mt-3 not-italic text-ink-muted">
              <span className="font-medium text-ink">{o.address.fullName}</span><br />
              {pii ? <>{o.address.line1}{o.address.line2 && `, ${o.address.line2}`}<br />{o.address.landmark && <>{o.address.landmark}<br /></>}</> : <>Street address hidden<br /></>}
              {o.address.city}, {stateName(o.address.stateCode ?? "")} {o.address.pincode}
            </address>
            {o.shipments.map((sh, i) => (
              <p key={i} className="mt-3 rounded-lg bg-canvas p-3">{sh.carrier}{sh.trackingNumber && ` · ${sh.trackingNumber}`} · {sh.status.replace(/_/g, " ")}{sh.trackingUrl && <><br /><a href={sh.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Tracking link</a></>}</p>
            ))}
          </section>

          <section className="card p-5 text-sm" aria-labelledby="msg-h">
            <h2 id="msg-h" className="font-semibold">Customer messages</h2>
            {o.messages.length === 0 ? <p className="mt-2 text-ink-muted">None yet.</p> : (
              <ul className="mt-2 space-y-1.5">{o.messages.map((m, i) => <li key={i}><span className="font-medium">{m.template.replace(/_/g, " ")}</span> · {m.channel} · <span className={m.status === "sent" ? "text-good-700" : m.status === "failed" ? "text-bad-700" : "text-warn-700"}>{m.status}</span>{m.lastError && <span className="block text-xs text-ink-muted">{m.lastError}</span>}</li>)}</ul>
            )}
          </section>

          {s.permissions.has("orders.notes") && (
            <section className="card p-5 text-sm" aria-labelledby="notes-h">
              <h2 id="notes-h" className="font-semibold">Internal notes</h2>
              <ul className="mt-2 space-y-2">{o.notes.map((n, i) => <li key={i} className="rounded-lg bg-canvas p-3"><p className="whitespace-pre-line">{n.body}</p><p className="mt-1 text-xs text-ink-muted">{n.staffEmail} · {formatDateTime(n.createdAt)}</p></li>)}</ul>
              <ActionForm action={addOrderNoteAction} className="mt-3">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="sr-only" htmlFor="note">New note</label>
                <textarea id="note" name="body" required maxLength={2000} rows={3} className="input h-auto py-2" placeholder="Only staff can see this" />
                <SubmitButton variant="secondary" className="mt-2">Add note</SubmitButton>
              </ActionForm>
            </section>
          )}

          {canCancel && o.status !== "cancelled" && (
            <section className="card p-5 text-sm" aria-labelledby="cancel-h">
              <h2 id="cancel-h" className="font-semibold text-bad-700">Cancel order</h2>
              <p className="mt-1 text-ink-muted">Stock is returned. Paid orders are refunded in full through Razorpay.</p>
              <ActionForm action={cancelOrderAdminAction} className="mt-3">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="font-medium">Reason (shown to the customer)<input name="reason" required minLength={3} maxLength={300} className="input mt-1 h-10" /></label>
                <SubmitButton variant="danger" className="mt-3" confirm="Cancel this order? This cannot be undone.">Cancel order</SubmitButton>
              </ActionForm>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

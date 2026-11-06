// Payment reconciliation with Razorpay. Server-side only. Shared by the
// storefront (webhook + cron) and the admin (manual checks, webhook retries),
// so a payment is always confirmed by the same verified path.
import type { Sql } from "./db";
import { applyRefundStatus, confirmPaidOrder, recordPaymentFailure, type ConfirmResult } from "./orders";
import { razorpay, type RazorpayConfig, type RzpPayment } from "./razorpay";

/** Submits a refund to Razorpay. On failure it stays 'pending' without a gateway id, shown in admin for retry. */
export async function submitRefund(
  sql: Sql, cfg: RazorpayConfig,
  r: { orderId: string; paymentRowId: string; providerPaymentId: string; amountPaise: number; reason: string; refundId?: string },
): Promise<{ submitted: boolean }> {
  let refundId = r.refundId;
  if (!refundId) {
    const [row] = await sql<{ id: string }[]>`
      insert into shop.refunds (order_id, payment_id, amount_paise, reason) values (${r.orderId}, ${r.paymentRowId}, ${r.amountPaise}, ${r.reason}) returning id`;
    refundId = row!.id;
  }
  try {
    const rf = await razorpay.refund(cfg, r.providerPaymentId, r.amountPaise, { order_id: r.orderId, reason: r.reason }, refundId.slice(0, 40));
    await applyRefundStatus(sql, refundId, rf.id, rf.status);
    return { submitted: true };
  } catch (e) {
    console.error("refund submission failed", e);
    return { submitted: false };
  }
}

async function storeGatewayDetails(sql: Sql, p: RzpPayment) {
  await sql`
    update shop.payments set fee_paise = coalesce(${p.fee ?? null}, fee_paise), gateway_tax_paise = coalesce(${p.tax ?? null}, gateway_tax_paise),
           method = coalesce(method, ${p.method ?? null}), last_checked_at = now()
    where provider_order_id = ${p.order_id}`;
}

/** Confirms a captured payment (verified by re-fetching it); refunds automatically if the stock is gone. */
async function confirmCaptured(sql: Sql, cfg: RazorpayConfig, p: RzpPayment): Promise<ConfirmOutcome> {
  // A second captured attempt for an order that is already paid is a duplicate charge: refund it.
  const [dup] = await sql<{ paymentRowId: string; orderId: string; orderNumber: string }[]>`
    select mine.id as "paymentRowId", o.id as "orderId", o.order_number as "orderNumber"
    from shop.payments mine join shop.orders o on o.id = mine.order_id
    where mine.provider_order_id = ${p.order_id} and mine.status <> 'captured'
      and exists (select 1 from shop.payments other where other.order_id = mine.order_id and other.id <> mine.id and other.status = 'captured')`;
  if (dup) {
    if (p.amount <= 0 || p.currency !== "INR") return { kind: "rejected", reason: "invalid amount" };
    await sql`update shop.payments set status = 'captured', provider_payment_id = ${p.id}, method = ${p.method ?? null}, verified_at = now() where id = ${dup.paymentRowId}`;
    await storeGatewayDetails(sql, p);
    await sql`insert into shop.order_events (order_id, status, note, actor)
              select ${dup.orderId}, status, 'Duplicate payment received for an already paid order; refunded in full', 'payment_gateway' from shop.orders where id = ${dup.orderId}`;
    await submitRefund(sql, cfg, { orderId: dup.orderId, paymentRowId: dup.paymentRowId, providerPaymentId: p.id, amountPaise: p.amount, reason: "Duplicate payment" });
    return { kind: "duplicate_refunded", orderNumber: dup.orderNumber };
  }
  const result = await confirmPaidOrder(sql, { providerOrderId: p.order_id, providerPaymentId: p.id, amountPaise: p.amount, currency: p.currency, status: p.status, method: p.method });
  await storeGatewayDetails(sql, p);
  if (result.kind === "needs_refund") {
    await submitRefund(sql, cfg, { orderId: result.orderId, paymentRowId: result.paymentRowId, providerPaymentId: result.providerPaymentId, amountPaise: result.amountPaise, reason: "Stock unavailable after payment" });
  }
  return result;
}

type ConfirmOutcome = ConfirmResult | { kind: "duplicate_refunded"; orderNumber: string };

export type SyncOutcome =
  | { outcome: "duplicate_refunded"; orderNumber: string }
  | { outcome: "confirmed"; orderNumber: string }
  | { outcome: "already_paid"; orderNumber: string }
  | { outcome: "refunded_stock_unavailable"; orderNumber: string }
  | { outcome: "failed"; detail: string }
  | { outcome: "pending"; detail: string }
  | { outcome: "no_payment" }
  | { outcome: "needs_review"; detail: string };

/**
 * Asks Razorpay what actually happened to one payment attempt and applies it.
 * Catches payments whose browser callback and webhook were both missed.
 */
export async function syncPaymentWithGateway(sql: Sql, cfg: RazorpayConfig, paymentRowId: string): Promise<SyncOutcome> {
  const [row] = await sql<{ providerOrderId: string }[]>`select provider_order_id as "providerOrderId" from shop.payments where id = ${paymentRowId}`;
  if (!row) return { outcome: "needs_review", detail: "Payment record not found." };
  const { items } = await razorpay.fetchOrderPayments(cfg, row.providerOrderId);
  await sql`update shop.payments set last_checked_at = now() where id = ${paymentRowId}`;
  let captured = items.find((p) => p.status === "captured" || p.status === "refunded");
  const authorized = items.find((p) => p.status === "authorized");
  if (!captured && authorized) {
    // auto-capture is on; capture explicitly if it hasn't happened yet
    try { captured = await razorpay.capture(cfg, authorized.id, authorized.amount); } catch { return { outcome: "pending", detail: "Authorised at the bank, not yet captured. Razorpay will capture or auto-refund it." }; }
  }
  if (captured) {
    if (captured.status === "refunded") return { outcome: "needs_review", detail: `Payment ${captured.id} was refunded in Razorpay — check the dashboard.` };
    const r = await confirmCaptured(sql, cfg, captured);
    if (r.kind === "rejected") return { outcome: "needs_review", detail: `Razorpay shows ${captured.id} captured but it was not accepted: ${r.reason}.` };
    if (r.kind === "needs_refund") return { outcome: "refunded_stock_unavailable", orderNumber: r.orderNumber };
    if (r.kind === "duplicate_refunded") return { outcome: "duplicate_refunded", orderNumber: r.orderNumber };
    return { outcome: r.alreadyConfirmed ? "already_paid" : "confirmed", orderNumber: r.orderNumber };
  }
  const failed = items.filter((p) => p.status === "failed").sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
  if (failed) {
    await recordPaymentFailure(sql, row.providerOrderId, failed.id, failed.error_code ?? null, failed.error_description ?? null);
    return { outcome: "failed", detail: failed.error_description ?? "Payment failed" };
  }
  return { outcome: "no_payment" };
}

/** Cron: checks unresolved payment attempts that are old enough that the callback should have arrived. */
export async function reconcilePendingPayments(sql: Sql, cfg: RazorpayConfig, opts: { limit?: number } = {}) {
  const rows = await sql<{ id: string }[]>`
    select p.id from shop.payments p join shop.orders o on o.id = p.order_id
    where p.status in ('created', 'authorized') and o.payment_status <> 'paid'
      and p.created_at between now() - interval '7 days' and now() - interval '10 minutes'
      and (p.last_checked_at is null or p.last_checked_at < now() - interval '15 minutes')
    order by p.created_at limit ${opts.limit ?? 25}`;
  const counts: Record<SyncOutcome["outcome"] | "error", number> = { confirmed: 0, duplicate_refunded: 0, already_paid: 0, refunded_stock_unavailable: 0, failed: 0, pending: 0, no_payment: 0, needs_review: 0, error: 0 };
  for (const r of rows) {
    try { counts[(await syncPaymentWithGateway(sql, cfg, r.id)).outcome]++; } catch (e) { counts.error++; console.error("reconcile", r.id, e); }
  }
  return { checked: rows.length, ...counts };
}

interface WebhookBody {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; error_code?: string; error_description?: string } };
    refund?: { entity: { id: string; payment_id: string; status: "pending" | "processed" | "failed" } };
  };
}

/** Applies one stored webhook event. Used on receipt and for retries from the admin. */
export async function processWebhookEvent(sql: Sql, cfg: RazorpayConfig, eventRowId: number): Promise<{ ok: boolean; error?: string }> {
  const [ev] = await sql<{ payload: WebhookBody }[]>`select payload from shop.payment_webhook_events where id = ${eventRowId}`;
  if (!ev) return { ok: false, error: "event not found" };
  const body = ev.payload;
  try {
    const p = body.payload.payment?.entity;
    if ((body.event === "payment.captured" || body.event === "order.paid") && p) {
      const fresh = await razorpay.fetchPayment(cfg, p.id); // never trust the payload alone
      await confirmCaptured(sql, cfg, fresh);
    } else if (body.event === "payment.failed" && p) {
      await recordPaymentFailure(sql, p.order_id, p.id, p.error_code ?? null, p.error_description ?? null);
    } else if ((body.event === "refund.processed" || body.event === "refund.failed") && body.payload.refund) {
      const r = body.payload.refund.entity;
      const [row] = await sql<{ id: string }[]>`select id from shop.refunds where provider_refund_id = ${r.id}`;
      if (row) await applyRefundStatus(sql, row.id, r.id, r.status);
    }
    await sql`update shop.payment_webhook_events set processed_at = now(), error = null where id = ${eventRowId}`;
    return { ok: true };
  } catch (e) {
    const error = String((e as Error).message).slice(0, 500);
    await sql`update shop.payment_webhook_events set error = ${error} where id = ${eventRowId}`;
    return { ok: false, error };
  }
}

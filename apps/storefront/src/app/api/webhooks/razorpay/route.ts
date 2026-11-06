import { NextResponse, type NextRequest } from "next/server";
import { applyRefundStatus, confirmPaidOrder, recordPaymentFailure } from "@zentro/commerce/orders";
import { razorpay, razorpayConfigFromEnv, verifyWebhookSignature } from "@zentro/commerce/razorpay";
import { db } from "@/lib/db";

/**
 * Razorpay webhook (configure in Razorpay Dashboard → Webhooks with events
 * payment.captured, payment.failed, order.paid, refund.processed, refund.failed).
 * Signature verified on the raw body; every event stored once by its id, so
 * gateway retries are idempotent.
 */
export async function POST(req: NextRequest) {
  const cfg = razorpayConfigFromEnv();
  if (!cfg?.webhookSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (raw.length > 200_000 || !verifyWebhookSignature(cfg.webhookSecret, raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const eventId = req.headers.get("x-razorpay-event-id") ?? "";
  const body = JSON.parse(raw) as {
    event: string;
    payload: { payment?: { entity: { id: string; order_id: string; amount: number; currency: string; status: string; method?: string; error_code?: string; error_description?: string } }; refund?: { entity: { id: string; payment_id: string; status: "pending" | "processed" | "failed"; notes?: Record<string, string> } } };
  };
  const sql = db();
  const [inserted] = await sql<{ id: number }[]>`
    insert into shop.payment_webhook_events (provider, event_id, event_type, payload)
    values ('razorpay', ${eventId || `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id ?? Date.now()}`}, ${body.event}, ${sql.json(body as never)})
    on conflict (provider, event_id) do nothing returning id`;
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const p = body.payload.payment?.entity;
    if ((body.event === "payment.captured" || body.event === "order.paid") && p) {
      // re-fetch rather than trusting the payload alone
      const fresh = await razorpay.fetchPayment(cfg, p.id);
      await confirmPaidOrder(sql, { providerOrderId: fresh.order_id, providerPaymentId: fresh.id, amountPaise: fresh.amount, currency: fresh.currency, status: fresh.status, method: fresh.method });
    } else if (body.event === "payment.failed" && p) {
      await recordPaymentFailure(sql, p.order_id, p.id, p.error_code ?? null, p.error_description ?? null);
    } else if ((body.event === "refund.processed" || body.event === "refund.failed") && body.payload.refund) {
      const r = body.payload.refund.entity;
      const [row] = await sql<{ id: string }[]>`select id from shop.refunds where provider_refund_id = ${r.id}`;
      if (row) await applyRefundStatus(sql, row.id, r.id, r.status);
    }
    await sql`update shop.payment_webhook_events set processed_at = now() where id = ${inserted.id}`;
  } catch (e) {
    await sql`update shop.payment_webhook_events set error = ${String((e as Error).message).slice(0, 500)} where id = ${inserted.id}`;
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // Razorpay will retry
  }
  return NextResponse.json({ ok: true });
}

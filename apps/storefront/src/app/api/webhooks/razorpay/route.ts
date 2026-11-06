import { NextResponse, type NextRequest } from "next/server";
import { processWebhookEvent } from "@zentro/commerce/payments";
import { razorpayConfigFromEnv, verifyWebhookSignature } from "@zentro/commerce/razorpay";
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
  let body: { event: string; payload: { payment?: { entity: { id: string } }; refund?: { entity: { id: string } } } };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const sql = db();
  const [inserted] = await sql<{ id: number }[]>`
    insert into shop.payment_webhook_events (provider, event_id, event_type, payload)
    values ('razorpay', ${eventId || `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id ?? Date.now()}`}, ${body.event}, ${sql.json(body as never)})
    on conflict (provider, event_id) do nothing returning id`;
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true });

  const r = await processWebhookEvent(sql, cfg, inserted.id);
  if (!r.ok) return NextResponse.json({ error: "processing failed" }, { status: 500 }); // Razorpay will retry
  return NextResponse.json({ ok: true });
}

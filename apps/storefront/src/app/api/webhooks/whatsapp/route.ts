import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applyDeliveryStatus, withdrawConsent } from "@zentro/commerce/messaging";
import { db } from "@/lib/db";

// WhatsApp Cloud API webhook (Meta App → WhatsApp → Configuration).
// GET: subscription verification. POST: message statuses + inbound replies.

export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse(null, { status: 403 });
}

const STOP = /^\s*(stop|unsubscribe|stop all|optout|opt out)\s*$/i;

export async function POST(req: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const got = req.headers.get("x-hub-signature-256") ?? "";
  if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return new NextResponse(null, { status: 401 });

  const body = JSON.parse(raw) as { entry?: { changes?: { value?: {
    statuses?: { id: string; status: string; errors?: { title?: string; code?: number }[]; pricing?: { category?: string } }[];
    messages?: { from: string; type: string; text?: { body?: string }; button?: { text?: string } }[];
  } }[] }[] };
  const sql = db();
  for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
    for (const s of ch.value?.statuses ?? []) {
      const status = s.status === "failed" ? "failed" : s.status === "read" ? "read" : s.status === "delivered" ? "delivered" : "sent";
      await applyDeliveryStatus(sql, "whatsapp", s.id, status, { error: s.errors?.[0]?.title, category: s.pricing?.category });
    }
    for (const m of ch.value?.messages ?? []) {
      const text = m.text?.body ?? m.button?.text ?? "";
      const phone = m.from.replace(/\D/g, "").slice(-10);
      if (STOP.test(text) && /^[6-9]\d{9}$/.test(phone)) await withdrawConsent(sql, "whatsapp", phone, "reply_stop", { text: text.slice(0, 40) });
    }
  }
  return NextResponse.json({ ok: true });
}

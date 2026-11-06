import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applyDeliveryStatus, withdrawConsent } from "@zentro/commerce/messaging";
import { db } from "@/lib/db";

// Resend webhooks are signed with Svix: v1,base64(HMAC_SHA256(secret, `${id}.${timestamp}.${body}`)).
function verify(secret: string, id: string, ts: string, body: string, header: string) {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return header.split(" ").some((part) => {
    const sig = part.split(",")[1] ?? "";
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  const ok = verify(secret, req.headers.get("svix-id") ?? "", req.headers.get("svix-timestamp") ?? "0", raw, req.headers.get("svix-signature") ?? "");
  if (!ok) return new NextResponse(null, { status: 401 });
  const e = JSON.parse(raw) as { type: string; data: { email_id: string; to?: string[] } };
  const sql = db();
  const map: Record<string, "sent" | "delivered" | "failed"> = { "email.sent": "sent", "email.delivered": "delivered", "email.bounced": "failed", "email.failed": "failed" };
  if (map[e.type]) await applyDeliveryStatus(sql, "resend", e.data.email_id, map[e.type]!, { type: e.type });
  if (e.type === "email.complained" || e.type === "email.bounced") {
    for (const to of e.data.to ?? []) await withdrawConsent(sql, "email", to.toLowerCase(), "provider_optout", { type: e.type });
  }
  return NextResponse.json({ ok: true });
}

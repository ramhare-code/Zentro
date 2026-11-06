import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applyDeliveryStatus } from "@zentro/commerce/messaging";
import { db } from "@/lib/db";

// MSG91 delivery reports. MSG91 does not sign webhooks, so the URL carries a
// long secret: https://<store>/api/webhooks/msg91?token=<MSG91_WEBHOOK_TOKEN>
export async function POST(req: NextRequest) {
  const token = process.env.MSG91_WEBHOOK_TOKEN;
  const got = req.nextUrl.searchParams.get("token") ?? "";
  if (!token || got.length !== token.length || !timingSafeEqual(Buffer.from(got), Buffer.from(token))) return new NextResponse(null, { status: 401 });
  const raw = await req.text();
  if (raw.length > 500_000) return new NextResponse(null, { status: 413 });
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return new NextResponse(null, { status: 400 }); }
  const items = (Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [data]) as { requestId?: string; request_id?: string; report?: { status?: string | number; desc?: string }[]; status?: string | number; desc?: string }[];
  const sql = db();
  for (const it of items) {
    const id = it.requestId ?? it.request_id;
    if (!id) continue;
    for (const r of it.report ?? [it]) {
      // MSG91 codes: 1 = delivered, 2 = failed, 9 = NDNC, 16/17/25 = rejected
      const s = String(r.status ?? "").toLowerCase();
      const status = s === "1" || s === "delivered" ? "delivered" : s === "2" || s === "9" || s === "16" || s === "17" || s === "25" || s.includes("fail") || s.includes("reject") ? "failed" : "sent";
      await applyDeliveryStatus(sql, "msg91", id, status, { error: r.desc, code: r.status });
    }
  }
  return NextResponse.json({ ok: true });
}

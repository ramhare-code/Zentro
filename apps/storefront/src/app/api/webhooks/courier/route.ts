import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applyTracking, parseIstDate, shipmentForAwb, shiprocketConfigFromEnv } from "@zentro/commerce/shipping";
import { db } from "@/lib/db";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Courier tracking webhook (Shiprocket → Settings → API → Webhooks). Shiprocket rejects URLs
 * containing "shiprocket" or "sr", hence the neutral path. Authenticated by the x-api-key token you set there.
 */
export async function POST(req: NextRequest) {
  const cfg = shiprocketConfigFromEnv();
  if (!cfg?.webhookToken) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!same(req.headers.get("x-api-key") ?? "", cfg.webhookToken)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: { awb?: string | number; current_status?: string; current_timestamp?: string; scans?: { date?: string; activity?: string; location?: string; "sr-status-label"?: string; status?: string }[] };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const awb = String(body.awb ?? "").trim();
  if (!awb) return NextResponse.json({ ok: true, ignored: "no awb" });
  const sql = db();
  const id = await shipmentForAwb(sql, awb);
  if (!id) return NextResponse.json({ ok: true, ignored: "unknown awb" }); // 200 so the courier doesn't retry forever
  const scans = (body.scans ?? []).map((s) => ({ status: s["sr-status-label"] || s.activity || s.status || "", at: parseIstDate(s.date ?? ""), location: s.location, description: s.activity }));
  if (body.current_status && body.current_timestamp) scans.push({ status: body.current_status, at: parseIstDate(body.current_timestamp), location: undefined, description: undefined });
  const r = await applyTracking(sql, id, scans.filter((s) => s.status));
  return NextResponse.json({ ok: true, added: r.added });
}

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/** Runs every few minutes (vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });
  const sql = db();
  const [r] = await sql<{ released: number }[]>`select shop.release_expired_reservations() as released`;
  await sql`delete from shop.rate_limits where window_start < now() - interval '1 day'`;
  await sql`delete from shop.analytics_events where occurred_at < now() - interval '13 months'`;
  return NextResponse.json({ releasedOrders: r?.released ?? 0 });
}

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { recordJob } from "@zentro/commerce/ops";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { processOutbox, startDueCampaigns } from "@zentro/commerce/messaging";
import { providerEnv } from "@/lib/messaging-env";
import { reconcilePendingPayments } from "@zentro/commerce/payments";
import { razorpayConfigFromEnv } from "@zentro/commerce/razorpay";
import { shiprocketConfigFromEnv, syncTracking } from "@zentro/commerce/shipping";

/** Runs every few minutes (vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });
  const sql = db();
  // every run is recorded (System status in the admin shows when it last ran) and failures raise an alert
  const result = await recordJob(sql, "maintenance", async () => {
    // check with Razorpay before releasing holds, so a payment whose callback was missed isn't cancelled
    const cfg = razorpayConfigFromEnv();
    const payments = cfg ? await reconcilePendingPayments(sql, cfg) : null;
    const [r] = await sql<{ released: number }[]>`select shop.release_expired_reservations() as released`;
    await sql`delete from shop.rate_limits where window_start < now() - interval '1 day'`;
    await sql`delete from shop.analytics_events where occurred_at < now() - interval '13 months'`;
    // cached pages show prices and banners: refresh them when a promotion or banner starts or ends
    const [edge] = await sql<{ n: number }[]>`
      select (select count(*) from shop.promotions where is_active and (starts_at between now() - interval '6 minutes' and now() or ends_at between now() - interval '6 minutes' and now()))
           + (select count(*) from shop.banners where is_active and (starts_at between now() - interval '6 minutes' and now() or ends_at between now() - interval '6 minutes' and now())) as n`;
    if (Number(edge?.n) > 0) revalidatePath("/", "layout");
    const courier = shiprocketConfigFromEnv();
    const tracking = courier ? await syncTracking(sql, courier).catch((e) => ({ error: String(e) })) : null;
    const campaignsStarted = await startDueCampaigns(sql);
    const messages = await processOutbox(sql, providerEnv(), { limit: 200 });
    return { payments, tracking, releasedOrders: r?.released ?? 0, campaignsStarted, messages };
  });
  return NextResponse.json(result);
}

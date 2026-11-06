import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor/i;

const schema = z.object({
  event: z.enum(["page_view", "product_view", "search", "add_to_cart", "begin_checkout", "purchase"]),
  path: z.string().max(300).startsWith("/"),
  referrer: z.string().max(1000).optional(),
  visitorId: z.guid().optional(),
  sessionId: z.guid().optional(),
  productId: z.guid().optional(),
  query: z.string().max(100).optional(),
  valuePaise: z.number().int().min(0).max(100_000_000).optional(),
});

function device(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Analytics beacon. Accepts only validated, size-limited events; never stores IP or UA. */
export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return new NextResponse(null, { status: 204 });

  // same-site only
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return new NextResponse(null, { status: 403 });

  const text = await req.text();
  if (text.length > 4000) return new NextResponse(null, { status: 413 });
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(text));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const e = parsed.data;

  const sql = db();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  // ip used transiently for abuse limiting only; it is hashed into the bucket name and never stored as data
  const [rl] = await sql<{ ok: boolean }[]>`select shop.rate_limit_hit(${"t:" + (await hash(ip))}, 240, 60) as ok`;
  if (!rl?.ok) return new NextResponse(null, { status: 429 });

  const url = new URL(e.path, req.nextUrl.origin);
  let referrerHost: string | null = null;
  try {
    const host = e.referrer ? new URL(e.referrer).hostname : null;
    referrerHost = host && host !== req.nextUrl.hostname ? host.replace(/^www\./, "").slice(0, 200) : null;
  } catch { /* ignore malformed referrer */ }
  const utm = (k: string) => url.searchParams.get(k)?.slice(0, 100) || null;
  const country = req.headers.get("x-vercel-ip-country");
  const hasIds = !!(e.visitorId && e.sessionId);

  await sql`
    insert into shop.analytics_events
      (event, visitor_id, session_id, path, product_id, search_query, referrer_host, utm_source, utm_medium, utm_campaign, device, country, value_paise)
    values (${e.event}, ${hasIds ? e.visitorId! : null}, ${hasIds ? e.sessionId! : null}, ${url.pathname.slice(0, 300)},
            ${e.productId ?? null}, ${e.query ?? null}, ${referrerHost}, ${utm("utm_source")}, ${utm("utm_medium")}, ${utm("utm_campaign")},
            ${device(ua)}, ${country && /^[A-Z]{2}$/.test(country) ? country : null}, ${e.valuePaise ?? null})`;
  return new NextResponse(null, { status: 204 });
}

async function hash(v: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Buffer.from(buf).toString("hex").slice(0, 24);
}

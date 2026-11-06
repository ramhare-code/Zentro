import { NextResponse, type NextRequest } from "next/server";
import { autocomplete } from "@/lib/catalog";

// Read-only, public catalogue data. Cached briefly at the edge/CDN.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ products: [], categories: [] });
  try {
    const data = await autocomplete(q);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (err) {
    console.error("suggest failed", err);
    return NextResponse.json({ products: [], categories: [] }, { status: 503 });
  }
}

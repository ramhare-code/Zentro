import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/** Lets the admin refresh a cached storefront page (e.g. after review moderation). */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!/^\/((p|c)\/[a-z0-9-]{1,120}|categories|search)?$/.test(path)) return NextResponse.json({ error: "bad path" }, { status: 400 });
  revalidatePath(path);
  return NextResponse.json({ ok: true });
}

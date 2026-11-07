import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/** Review photos for moderators, including ones not yet public. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s?.permissions.has("reviews.moderate")) return new NextResponse(null, { status: 403 });
  const id = z.guid().safeParse((await params).id).data;
  if (!id) return new NextResponse(null, { status: 404 });
  const [m] = await db()<{ url: string; key: string | null }[]>`select url, storage_key as key from shop.review_media where id = ${id}`;
  if (!m) return new NextResponse(null, { status: 404 });
  if (!m.key?.startsWith("db:")) return NextResponse.redirect(m.url); // object storage
  const [f] = await db()<{ bytes: Buffer; type: string }[]>`select bytes, content_type as type from shop.media_files where id = ${m.key.slice(3)}`;
  if (!f) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "content-type": f.type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
}

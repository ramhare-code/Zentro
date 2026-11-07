import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

/** Serves images stored by the admin's database media driver (development / small stores). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.guid().safeParse((await params).id).data;
  if (!id) return new NextResponse(null, { status: 404 });
  // review photos are only public once the review is approved
  const [f] = await db()<{ bytes: Buffer; contentType: string; sha: string; purpose: string }[]>`
    select f.bytes, f.content_type as "contentType", f.sha256 as sha, f.purpose from shop.media_files f
    where f.id = ${id} and (f.purpose <> 'review' or exists (
      select 1 from shop.review_media m join shop.reviews r on r.id = m.review_id where m.storage_key = 'db:' || f.id::text and r.status = 'published'))`;
  if (!f) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      "content-type": f.contentType,
      // catalogue images never change; review photos can be taken down, so cache them briefly
      "cache-control": f.purpose === "review" ? "public, max-age=600" : "public, max-age=31536000, immutable",
      etag: `"${f.sha.slice(0, 32)}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}

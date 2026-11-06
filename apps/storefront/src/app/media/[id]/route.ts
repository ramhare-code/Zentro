import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

/** Serves images stored by the admin's database media driver (development / small stores). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.guid().safeParse((await params).id).data;
  if (!id) return new NextResponse(null, { status: 404 });
  const [f] = await db()<{ bytes: Buffer; contentType: string; sha: string }[]>`
    select bytes, content_type as "contentType", sha256 as sha from shop.media_files where id = ${id}`;
  if (!f) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      "content-type": f.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      etag: `"${f.sha.slice(0, 32)}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}

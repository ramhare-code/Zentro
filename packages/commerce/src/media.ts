// Image upload handling shared by the admin (catalogue) and storefront (review photos).
// Type is detected from the bytes, size limits enforced, and customer photos are
// re-encoded so location/camera metadata and any non-image payload are stripped.
import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "./db";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 12 && buf.toString("ascii", 4, 8) === "ftyp" && /^avi[fs]$/.test(buf.toString("ascii", 8, 12))) return "image/avif";
  return null;
}

export function imageSize(buf: Buffer, type: ImageType): { width: number; height: number } | null {
  try {
    if (type === "image/png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (type === "image/webp") {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (type === "image/jpeg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1]!;
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch { /* truncated */ }
  return null;
}

export class MediaError extends Error {}
export interface StoredMedia { url: string; key: string; width: number | null; height: number | null }

/** Re-encodes to WebP (max side `maxSide`), applying EXIF rotation and dropping all metadata. */
export async function reencodeImage(buf: Buffer, maxSide = 1600): Promise<{ buf: Buffer; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  try {
    const out = await sharp(buf, { limitInputPixels: 40_000_000, failOn: "error" }).rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    return { buf: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new MediaError("This image couldn’t be read. Try a different photo (JPEG, PNG or WebP).");
  }
}

export async function storeImageBuffer(sql: Sql, input: Buffer, opts: { createdBy: string | null; purpose: "catalogue" | "review"; reencode?: boolean; minSide?: number }): Promise<StoredMedia> {
  if (input.length === 0) throw new MediaError("The file is empty.");
  if (input.length > MAX_IMAGE_BYTES) throw new MediaError("Images must be 5 MB or smaller.");
  let type = sniffImage(input);
  if (!type) throw new MediaError("Upload a JPEG, PNG, WebP or AVIF image.");
  let buf = input;
  let dims = imageSize(buf, type);
  if (opts.reencode) { const r = await reencodeImage(buf); buf = r.buf; type = "image/webp"; dims = { width: r.width, height: r.height }; }
  const min = opts.minSide ?? 200;
  if (dims && (dims.width < min || dims.height < min)) throw new MediaError(`Images should be at least ${min} × ${min} pixels.`);
  if (dims && (dims.width > 8000 || dims.height > 8000)) throw new MediaError("Images can be at most 8000 pixels on a side.");
  const sha = createHash("sha256").update(buf).digest("hex");

  if (process.env.MEDIA_STORAGE === "supabase") {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, bucket = process.env.MEDIA_BUCKET || "product-media";
    if (!base || !key) throw new MediaError("Supabase Storage isn’t configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
    const ext = type.split("/")[1]!.replace("jpeg", "jpg");
    const path = `${opts.purpose === "review" ? "reviews" : "products"}/${sha.slice(0, 2)}/${randomUUID()}.${ext}`;
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
      method: "POST", body: new Uint8Array(buf),
      headers: { authorization: `Bearer ${key}`, "content-type": type, "cache-control": "max-age=31536000", "x-upsert": "false" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new MediaError(`Storage upload failed (${res.status}).`);
    return { url: `${base}/storage/v1/object/public/${bucket}/${path}`, key: `supabase:${bucket}/${path}`, width: dims?.width ?? null, height: dims?.height ?? null };
  }
  const [row] = await sql<{ id: string }[]>`
    insert into shop.media_files (content_type, bytes, size_bytes, sha256, width, height, created_by, purpose)
    values (${type}, ${buf}, ${buf.length}, ${sha}, ${dims?.width ?? null}, ${dims?.height ?? null}, ${opts.createdBy}, ${opts.purpose}) returning id`;
  return { url: `/media/${row!.id}`, key: `db:${row!.id}`, width: dims?.width ?? null, height: dims?.height ?? null };
}

export async function deleteStoredImage(sql: Sql, key: string | null) {
  if (!key) return;
  if (key.startsWith("db:")) await sql`delete from shop.media_files where id = ${key.slice(3)}`;
  else if (key.startsWith("supabase:")) {
    const [bucket, ...rest] = key.slice(9).split("/");
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (base && k) await fetch(`${base}/storage/v1/object/${bucket}`, { method: "DELETE", headers: { authorization: `Bearer ${k}`, "content-type": "application/json" }, body: JSON.stringify({ prefixes: [rest.join("/")] }) }).catch(() => {});
  }
}

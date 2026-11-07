import "server-only";
import { deleteStoredImage as del, storeImageBuffer, type StoredMedia } from "@zentro/commerce/media";
import { db } from "./db";

export { imageSize, MAX_IMAGE_BYTES, MediaError, sniffImage, type StoredMedia } from "@zentro/commerce/media";

/**
 * Stores an uploaded catalogue image. MEDIA_STORAGE=supabase uses Supabase Storage (public bucket,
 * service-role key on the server only); otherwise images are kept in the database.
 */
export async function storeImage(file: File, staffId: string): Promise<StoredMedia> {
  return storeImageBuffer(db(), Buffer.from(await file.arrayBuffer()), { createdBy: staffId, purpose: "catalogue" });
}

export async function deleteStoredImage(key: string | null) {
  return del(db(), key);
}

/** Absolute URL for showing a stored image inside the admin. */
export function mediaSrc(url: string | null | undefined): string {
  if (!url) return "";
  return url.startsWith("/") ? `${(process.env.STOREFRONT_URL ?? "").replace(/\/$/, "")}${url}` : url;
}

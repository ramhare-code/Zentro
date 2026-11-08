"use server";

import { z } from "zod";
import { audit } from "../audit";
import { db } from "../db";
import { revalidateStorefront } from "../catalog-admin";
import { deleteStoredImage } from "../media";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const REASONS = ["spam", "abusive", "personal_information", "not_about_product", "duplicate", "other"] as const;

/** Publish or reject. Ratings are recalculated from published reviews by a database trigger; staff can't edit text or stars. */
export async function moderateReviewAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("reviews.moderate");
    const id = z.guid().parse(form.get("reviewId"));
    const op = z.enum(["publish", "reject"]).parse(form.get("op"));
    const reason: string | null = op === "reject" ? (z.enum(REASONS).safeParse(form.get("reason")).data ?? null) : null;
    if (op === "reject" && !reason) throw new UserError("Choose a rejection reason.");
    const sql = db();
    const [r] = await sql<{ slug: string | null }[]>`
      update shop.reviews r set status = ${op === "publish" ? "published" : "rejected"}, moderation_reason = ${reason},
             report_count = case when ${op} = 'publish' then 0 else r.report_count end
      from shop.products p where r.id = ${id} and p.id = r.product_id returning p.slug`;
    // staff checked it: earlier customer reports no longer count towards hiding it again
    if (r && op === "publish") await sql`delete from shop.review_reports where review_id = ${id}`;
    if (!r) throw new UserError("Review not found.");
    await audit(s, { action: `review.${op}`, entityType: "review", entityId: id, details: { reason } });
    // the queue refreshes on the next visit, so the decision stays visible on the card
    // refresh the cached product page on the storefront
    if (r.slug && process.env.STOREFRONT_URL && process.env.REVALIDATE_SECRET) {
      await revalidateStorefront([`/p/${r.slug}`, `/p/${r.slug}/reviews`]);
    }
    return { ok: true, message: op === "publish" ? "Published." : "Rejected." };
  });
}

/** Removes one photo (e.g. it shows someone's face or address) while keeping the review. */
export async function removeReviewPhotoAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("reviews.moderate");
    const id = z.guid().parse(form.get("photoId"));
    const sql = db();
    const [m] = await sql<{ key: string | null; reviewId: string }[]>`delete from shop.review_media where id = ${id} returning storage_key as key, review_id as "reviewId"`;
    if (!m) throw new UserError("Photo not found.");
    await deleteStoredImage(m.key);
    await audit(s, { action: "review.photo_remove", entityType: "review", entityId: m.reviewId });
    const [p] = await sql<{ slug: string }[]>`select p.slug from shop.reviews r join shop.products p on p.id = r.product_id where r.id = ${m.reviewId}`;
    if (p) await revalidateStorefront([`/p/${p.slug}`]);
    return { ok: true, message: "Photo removed." };
  });
}

/** Public reply from the store, shown under the review. Empty text removes the reply. */
export async function replyReviewAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("reviews.moderate");
    const id = z.guid().parse(form.get("reviewId"));
    const text = String(form.get("reply") ?? "").trim();
    if (text.length > 2000) throw new UserError("Keep the reply under 2000 characters.");
    const sql = db();
    const [r] = await sql<{ slug: string }[]>`
      update shop.reviews r set seller_reply = ${text || null}, seller_replied_at = ${text ? sql`now()` : null}, seller_replied_by = ${text ? s.staffId : null}
      from shop.products p where r.id = ${id} and p.id = r.product_id returning p.slug`;
    if (!r) throw new UserError("Review not found.");
    await audit(s, { action: text ? "review.reply" : "review.reply_remove", entityType: "review", entityId: id });
    await revalidateStorefront([`/p/${r.slug}`, `/p/${r.slug}/reviews`]);
    return { ok: true, message: text ? "Reply published." : "Reply removed." };
  });
}

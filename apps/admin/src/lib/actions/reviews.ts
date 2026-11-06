"use server";

import { z } from "zod";
import { audit } from "../audit";
import { db } from "../db";
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
      update shop.reviews r set status = ${op === "publish" ? "published" : "rejected"}, moderation_reason = ${reason}
      from shop.products p where r.id = ${id} and p.id = r.product_id returning p.slug`;
    if (!r) throw new UserError("Review not found.");
    await audit(s, { action: `review.${op}`, entityType: "review", entityId: id, details: { reason } });
    // the queue refreshes on the next visit, so the decision stays visible on the card
    // refresh the cached product page on the storefront
    if (r.slug && process.env.STOREFRONT_URL && process.env.REVALIDATE_SECRET) {
      void fetch(`${process.env.STOREFRONT_URL}/api/revalidate?path=/p/${r.slug}`, { method: "POST", headers: { authorization: `Bearer ${process.env.REVALIDATE_SECRET}` } }).catch(() => {});
    }
    return { ok: true, message: op === "publish" ? "Published." : "Rejected." };
  });
}

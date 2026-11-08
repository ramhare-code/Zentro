"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteStoredImage, MediaError, storeImageBuffer } from "@zentro/commerce/media";
import { findOrderForGuest } from "@zentro/commerce/orders";
import { addToCartAction } from "./cart";
import { getCustomer, rateLimited } from "../customer";
import { db } from "../db";
import { REPORT_REASONS } from "../review-reasons";

// ------------------------------------------------------------------ wishlist

export type WishResult = { ok: boolean; saved?: boolean; needsLogin?: boolean; error?: string };

export async function toggleWishlistAction(productId: string): Promise<WishResult> {
  const id = z.guid().safeParse(productId).data;
  if (!id) return { ok: false, error: "Invalid product." };
  const c = await getCustomer();
  if (!c) return { ok: false, needsLogin: true };
  const sql = db();
  const del = await sql`delete from shop.wishlist_items where user_id = ${c.id} and product_id = ${id}`;
  if (del.count) { revalidatePath("/wishlist"); return { ok: true, saved: false }; }
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from shop.wishlist_items where user_id = ${c.id}`) as unknown as [{ n: number }];
  if (n >= 200) return { ok: false, error: "Your wishlist is full (200 items)." };
  await sql`insert into shop.wishlist_items (user_id, product_id) select ${c.id}, id from shop.products where id = ${id} and shop.product_live(is_active, publish_at, archived_at) on conflict do nothing`;
  revalidatePath("/wishlist");
  return { ok: true, saved: true };
}

export async function isWishlisted(productId: string): Promise<boolean> {
  const c = await getCustomer();
  if (!c || !z.guid().safeParse(productId).success) return false;
  const [r] = await db()`select 1 from shop.wishlist_items where user_id = ${c.id} and product_id = ${productId}`;
  return !!r;
}

/** Moves a single-variant (or first in-stock variant) product from the wishlist to the cart. */
export async function moveToCartAction(productId: string): Promise<WishResult> {
  const c = await getCustomer();
  if (!c) return { ok: false, needsLogin: true };
  const [v] = await db()<{ id: string }[]>`
    select id from shop.product_variants where product_id = ${productId} and is_active and stock > 0 order by position limit 1`;
  if (!v) return { ok: false, error: "This item is out of stock." };
  const r = await addToCartAction(v.id, 1);
  if (!r.ok) return { ok: false, error: r.error };
  await db()`delete from shop.wishlist_items where user_id = ${c.id} and product_id = ${productId}`;
  revalidatePath("/wishlist");
  return { ok: true };
}

// ------------------------------------------------------------------ reviews

const BANNED = /\b(fuck|shit|bitch|bastard|chutiya|madarchod|bhenchod|randi|harami)\b/i;

/** Automatic, transparent screening. Flags send a review to staff; they never change the rating. */
export async function screenReview(title: string, body: string): Promise<string[]> {
  const text = `${title} ${body}`;
  const flags: string[] = [];
  if (/https?:\/\/|www\.|\.(com|in|net|org)\b/i.test(text)) flags.push("contains a link");
  if (/[^@\s]+@[^@\s]+\.[a-z]{2,}/i.test(text)) flags.push("contains an email address");
  if (/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.test(text)) flags.push("contains a phone number");
  if (BANNED.test(text)) flags.push("possible abusive language");
  if (body.length > 40 && body === body.toUpperCase() && /[A-Z]/.test(body)) flags.push("all capitals");
  return flags;
}

export type ReviewResult = { ok?: boolean; error?: string; message?: string } | undefined;

export async function submitReviewAction(_p: ReviewResult, f: FormData): Promise<ReviewResult> {
  const orderNumber = String(f.get("orderNumber") ?? "");
  const token = String(f.get("token") ?? "");
  const orderItemId = z.guid().safeParse(f.get("orderItemId")).data;
  const rating = z.coerce.number().int().min(1).max(5).safeParse(f.get("rating")).data;
  const title = String(f.get("title") ?? "").trim().slice(0, 120);
  const body = String(f.get("body") ?? "").trim().slice(0, 4000);
  const name = String(f.get("displayName") ?? "").trim().slice(0, 60);
  if (!rating) return { error: "Choose a star rating." };
  if (name.length < 2) return { error: "Enter the name to show with your review." };
  if (body && body.length < 10) return { error: "Write at least a sentence, or leave the review text empty." };
  const sql = db();
  const orderId = await findOrderForGuest(sql, orderNumber, token);
  if (!orderId || !orderItemId) return { error: "We couldn’t verify this purchase." };
  if (await rateLimited(`review:${orderId}`, 20, 3600)) return { error: "Too many reviews at once. Please try again later." };
  const [item] = await sql<{ productId: string | null; userId: string | null; status: string; slug: string | null }[]>`
    select i.product_id as "productId", o.user_id as "userId", o.status, p.slug
    from shop.order_items i join shop.orders o on o.id = i.order_id left join shop.products p on p.id = i.product_id
    where i.id = ${orderItemId} and i.order_id = ${orderId}`;
  if (!item?.productId) return { error: "This product can’t be reviewed." };
  if (item.status !== "delivered") return { error: "You can review items once they’ve been delivered." };
  const files = f.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length > 3) return { error: "Add up to 3 photos." };
  // photos are re-encoded (removes location and camera data) before anything is saved
  const stored: Awaited<ReturnType<typeof storeImageBuffer>>[] = [];
  try {
    for (const file of files) stored.push(await storeImageBuffer(sql, Buffer.from(await file.arrayBuffer()), { createdBy: null, purpose: "review", reencode: true, minSide: 300 }));
  } catch (e) {
    for (const m of stored) await deleteStoredImage(sql, m.key);
    if (e instanceof MediaError) return { error: e.message };
    throw e;
  }
  const flags = await screenReview(title, body);
  if (stored.length) flags.push("has photos");
  // a person checks every photo before it's shown
  const status = flags.length ? "pending" : "published";
  const [review] = await sql<{ id: string }[]>`
    insert into shop.reviews (product_id, user_id, order_item_id, display_name, rating, title, body, status, auto_flags)
    values (${item.productId}, ${item.userId}, ${orderItemId}, ${name}, ${rating}, ${title || null}, ${body || null}, ${status}, ${flags})
    on conflict (order_item_id) do nothing returning id`;
  if (!review) {
    for (const m of stored) await deleteStoredImage(sql, m.key);
    return { error: "You’ve already reviewed this item." };
  }
  for (const [i, m] of stored.entries()) {
    await sql`insert into shop.review_media (review_id, url, storage_key, width, height, sort_order) values (${review.id}, ${m.url}, ${m.key}, ${m.width}, ${m.height}, ${i})`;
  }
  if (item.slug) revalidatePath(`/p/${item.slug}`);
  return { ok: true, message: status === "published" ? "Thanks! Your review is live." : stored.length ? "Thanks! Your review and photos will appear after a quick check by our team." : "Thanks! Your review will appear after a quick check by our team." };
}

// ------------------------------------------------------------------ review feedback

export type VoteResult = { ok: boolean; voted?: boolean; count?: number; needsLogin?: boolean; error?: string };

async function refreshReviewPages(reviewId: string) {
  const [p] = await db()<{ slug: string }[]>`select p.slug from shop.reviews r join shop.products p on p.id = r.product_id where r.id = ${reviewId}`;
  if (p) { revalidatePath(`/p/${p.slug}`); revalidatePath(`/p/${p.slug}/reviews`); }
}

/** "Helpful" toggle: one vote per signed-in customer; the count is kept by a database trigger. */
export async function voteHelpfulAction(reviewId: string): Promise<VoteResult> {
  const id = z.guid().safeParse(reviewId).data;
  if (!id) return { ok: false, error: "Invalid review." };
  const c = await getCustomer();
  if (!c) return { ok: false, needsLogin: true };
  if (await rateLimited(`vote:${c.id}`, 60, 3600)) return { ok: false, error: "Too many votes. Please try again later." };
  const sql = db();
  const [r] = await sql<{ userId: string | null }[]>`select user_id as "userId" from shop.reviews where id = ${id} and status = 'published'`;
  if (!r) return { ok: false, error: "This review is no longer available." };
  if (r.userId === c.id) return { ok: false, error: "You can’t vote on your own review." };
  const del = await sql`delete from shop.review_votes where review_id = ${id} and user_id = ${c.id}`;
  if (!del.count) await sql`insert into shop.review_votes (review_id, user_id) values (${id}, ${c.id}) on conflict do nothing`;
  const [{ n }] = (await sql<{ n: number }[]>`select helpful_count as n from shop.reviews where id = ${id}`) as unknown as [{ n: number }];
  await refreshReviewPages(id);
  return { ok: true, voted: !del.count, count: n };
}

const HIDE_AFTER_REPORTS = 3;

/** Reports a review. After several customers report it, it is hidden until staff review it. */
export async function reportReviewAction(reviewId: string, reason: string): Promise<VoteResult> {
  const id = z.guid().safeParse(reviewId).data;
  const why = z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS]).safeParse(reason).data;
  if (!id || !why) return { ok: false, error: "Choose a reason." };
  const c = await getCustomer();
  if (!c) return { ok: false, needsLogin: true };
  if (await rateLimited(`report:${c.id}`, 20, 3600)) return { ok: false, error: "Too many reports. Please try again later." };
  const sql = db();
  const hidden = await sql.begin(async (tx) => {
    const [r] = await tx<{ status: string }[]>`select status from shop.reviews where id = ${id} for update`;
    if (!r || r.status !== "published") return false;
    await tx`insert into shop.review_reports (review_id, reporter, reason) values (${id}, ${"c:" + c.id}, ${why}) on conflict do nothing`;
    const [{ n }] = (await tx<{ n: number }[]>`
      update shop.reviews set report_count = (select count(*) from shop.review_reports where review_id = ${id})
      where id = ${id} returning report_count as n`) as unknown as [{ n: number }];
    if (n >= HIDE_AFTER_REPORTS) {
      await tx`update shop.reviews set status = 'pending', auto_flags = array_append(auto_flags, 'reported by customers') where id = ${id}`;
      return true;
    }
    return false;
  });
  if (hidden) await refreshReviewPages(id);
  return { ok: true };
}

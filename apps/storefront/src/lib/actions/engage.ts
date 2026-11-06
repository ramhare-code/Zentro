"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findOrderForGuest } from "@zentro/commerce/orders";
import { addToCartAction } from "./cart";
import { getCustomer, rateLimited } from "../customer";
import { db } from "../db";

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
  await sql`insert into shop.wishlist_items (user_id, product_id) select ${c.id}, id from shop.products where id = ${id} and is_active on conflict do nothing`;
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
  const flags = await screenReview(title, body);
  const status = flags.length ? "pending" : "published";
  const inserted = await sql`
    insert into shop.reviews (product_id, user_id, order_item_id, display_name, rating, title, body, status, auto_flags)
    values (${item.productId}, ${item.userId}, ${orderItemId}, ${name}, ${rating}, ${title || null}, ${body || null}, ${status}, ${flags})
    on conflict (order_item_id) do nothing`;
  if (!inserted.count) return { error: "You’ve already reviewed this item." };
  if (item.slug) revalidatePath(`/p/${item.slug}`);
  return { ok: true, message: status === "published" ? "Thanks! Your review is live." : "Thanks! Your review will appear after a quick check by our team." };
}

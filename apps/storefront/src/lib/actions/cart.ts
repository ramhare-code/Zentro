"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCartId, syncCartCount } from "../cart";
import { db } from "../db";

export type CartResult = { ok: boolean; count?: number; error?: string };

const input = z.object({ variantId: z.guid(), quantity: z.number().int().min(1).max(10) });

export async function addToCartAction(variantId: string, quantity = 1): Promise<CartResult> {
  const parsed = input.safeParse({ variantId, quantity });
  if (!parsed.success) return { ok: false, error: "Invalid item." };
  const sql = db();
  const [v] = await sql<{ stock: number; available: boolean }[]>`
    select v.stock, (v.is_active and p.is_active) as available from shop.product_variants v join shop.products p on p.id = v.product_id where v.id = ${variantId}`;
  if (!v?.available) return { ok: false, error: "This item is no longer available." };
  const cartId = (await getCartId(true))!;
  const [existing] = await sql<{ quantity: number }[]>`select quantity from shop.cart_items where cart_id = ${cartId} and variant_id = ${variantId}`;
  const next = Math.min(10, (existing?.quantity ?? 0) + quantity);
  if (next > v.stock) return { ok: false, error: v.stock === 0 ? "Sorry, this just sold out." : `Only ${v.stock} available.` };
  await sql`insert into shop.cart_items (cart_id, variant_id, quantity) values (${cartId}, ${variantId}, ${next})
            on conflict (cart_id, variant_id) do update set quantity = ${next}`;
  const count = await syncCartCount(cartId);
  revalidatePath("/cart");
  return { ok: true, count };
}

export async function setCartQuantityAction(variantId: string, quantity: number): Promise<CartResult> {
  const parsed = z.object({ variantId: z.guid(), quantity: z.number().int().min(0).max(10) }).safeParse({ variantId, quantity });
  if (!parsed.success) return { ok: false, error: "Invalid quantity." };
  const cartId = await getCartId(false);
  if (!cartId) return { ok: false, error: "Your cart is empty." };
  const sql = db();
  if (quantity === 0) {
    await sql`delete from shop.cart_items where cart_id = ${cartId} and variant_id = ${variantId}`;
  } else {
    const [v] = await sql<{ stock: number }[]>`select stock from shop.product_variants where id = ${variantId}`;
    if (!v || quantity > v.stock) return { ok: false, error: `Only ${v?.stock ?? 0} available.` };
    await sql`update shop.cart_items set quantity = ${quantity} where cart_id = ${cartId} and variant_id = ${variantId}`;
  }
  const count = await syncCartCount(cartId);
  revalidatePath("/cart");
  return { ok: true, count };
}

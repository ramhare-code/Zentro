import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

export const CART_COOKIE = "zentro_cart";
export const CART_COUNT_COOKIE = "zentro_cart_n"; // readable by the header badge; not sensitive
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export interface CartLine {
  variantId: string;
  quantity: number;
  productName: string;
  productSlug: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  pricePaise: number;
  mrpPaise: number;
  stock: number;
  available: boolean;
}

async function cartToken(create: boolean): Promise<string | null> {
  const jar = await cookies();
  let token = jar.get(CART_COOKIE)?.value;
  if (token && !/^[A-Za-z0-9_-]{32,64}$/.test(token)) token = undefined;
  if (!token && create) {
    token = randomBytes(32).toString("base64url");
    jar.set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 60 });
  }
  return token ?? null;
}

export async function getCartId(create = false): Promise<string | null> {
  const token = await cartToken(create);
  if (!token) return null;
  const sql = db();
  const hash = sha256(token);
  if (create) {
    const [c] = await sql<{ id: string }[]>`
      insert into shop.carts (guest_token_hash) values (${hash})
      on conflict (guest_token_hash) do update set updated_at = now() returning id`;
    return c!.id;
  }
  const [c] = await sql<{ id: string }[]>`select id from shop.carts where guest_token_hash = ${hash}`;
  return c?.id ?? null;
}

export async function getCartLines(cartId: string | null): Promise<CartLine[]> {
  if (!cartId) return [];
  return db()<CartLine[]>`
    select i.variant_id as "variantId", i.quantity, p.name as "productName", p.slug as "productSlug",
           nullif(array_to_string(array(select value from jsonb_each_text(v.options)), ' / '), '') as "variantLabel",
           v.sku, coalesce((select url from shop.product_media m where m.id = v.media_id),
                           (select url from shop.product_media m where m.product_id = p.id and m.kind = 'image' order by sort_order limit 1)) as "imageUrl",
           v.price_paise as "pricePaise", v.mrp_paise as "mrpPaise", v.stock, (v.is_active and p.is_active) as available
    from shop.cart_items i
    join shop.product_variants v on v.id = i.variant_id
    join shop.products p on p.id = v.product_id
    where i.cart_id = ${cartId}
    order by i.added_at`;
}

export async function linesForVariant(variantId: string, quantity: number): Promise<CartLine[]> {
  const rows = await db()<CartLine[]>`
    select v.id as "variantId", ${quantity}::int as quantity, p.name as "productName", p.slug as "productSlug",
           nullif(array_to_string(array(select value from jsonb_each_text(v.options)), ' / '), '') as "variantLabel",
           v.sku, (select url from shop.product_media m where m.product_id = p.id and m.kind = 'image' order by sort_order limit 1) as "imageUrl",
           v.price_paise as "pricePaise", v.mrp_paise as "mrpPaise", v.stock, (v.is_active and p.is_active) as available
    from shop.product_variants v join shop.products p on p.id = v.product_id where v.id = ${variantId}`;
  return rows;
}

export async function syncCartCount(cartId: string | null) {
  const [r] = cartId ? await db()<{ n: number }[]>`select coalesce(sum(quantity), 0)::int as n from shop.cart_items where cart_id = ${cartId}` : [{ n: 0 }];
  (await cookies()).set(CART_COUNT_COOKIE, String(r?.n ?? 0), { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return r?.n ?? 0;
}

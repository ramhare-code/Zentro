import "server-only";
import { db } from "./db";

export interface CouponRow {
  id: string; code: string; description: string; discountType: "percent" | "fixed"; discountValue: number; maxDiscountPaise: number | null;
  minOrderPaise: number; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perUserLimit: number | null; firstOrderOnly: boolean;
  usedCount: number; isActive: boolean; appliesTo: "all" | "categories" | "products"; categoryIds: string[]; productIds: string[];
  combinable: boolean; isPublic: boolean; archivedAt: Date | null; createdAt: Date;
  orders: number; discountGivenPaise: number; revenuePaise: number;
}

const COUPON_COLS = `c.id, c.code, c.description, c.discount_type as "discountType", c.discount_value as "discountValue", c.max_discount_paise as "maxDiscountPaise",
  c.min_order_paise as "minOrderPaise", c.starts_at as "startsAt", c.ends_at as "endsAt", c.usage_limit as "usageLimit", c.per_user_limit as "perUserLimit",
  c.first_order_only as "firstOrderOnly", c.used_count as "usedCount", c.is_active as "isActive", c.applies_to as "appliesTo",
  c.category_ids::text[] as "categoryIds", c.product_ids::text[] as "productIds", c.combinable, c.is_public as "isPublic", c.archived_at as "archivedAt", c.created_at as "createdAt",
  coalesce(st.orders, 0) as orders, coalesce(st.discount, 0) as "discountGivenPaise", coalesce(st.revenue, 0) as "revenuePaise"`;
const COUPON_STATS = `left join lateral (
  select count(*)::int as orders, sum(o.discount_paise)::float8 as discount, sum(o.total_paise)::float8 as revenue from shop.orders o
  where o.coupon_id = c.id and o.payment_status in ('paid','partially_refunded','refund_pending','refunded') and o.status <> 'cancelled') st on true`;

export async function listCoupons(archived: boolean) {
  const sql = db();
  return sql<CouponRow[]>`select ${sql.unsafe(COUPON_COLS)} from shop.coupons c ${sql.unsafe(COUPON_STATS)}
    where ${archived ? sql`c.archived_at is not null` : sql`c.archived_at is null`} order by c.created_at desc limit 300`;
}
export async function getCoupon(id: string) {
  const sql = db();
  const [c] = await sql<CouponRow[]>`select ${sql.unsafe(COUPON_COLS)} from shop.coupons c ${sql.unsafe(COUPON_STATS)} where c.id = ${id}`;
  return c ?? null;
}

export interface PromotionRow {
  id: string; name: string; badge: string; discountType: "percent" | "fixed"; discountValue: number; appliesTo: "all" | "categories" | "brands" | "products";
  categoryIds: string[]; brandIds: string[]; productIds: string[]; startsAt: Date; endsAt: Date; isActive: boolean; createdAt: Date;
  unitsSold: number; revenuePaise: number; discountGivenPaise: number;
}
const PROMO_COLS = `p.id, p.name, p.badge, p.discount_type as "discountType", p.discount_value as "discountValue", p.applies_to as "appliesTo",
  p.category_ids::text[] as "categoryIds", p.brand_ids::text[] as "brandIds", p.product_ids::text[] as "productIds",
  p.starts_at as "startsAt", p.ends_at as "endsAt", p.is_active as "isActive", p.created_at as "createdAt",
  coalesce(st.units, 0) as "unitsSold", coalesce(st.revenue, 0) as "revenuePaise", coalesce(st.discount, 0) as "discountGivenPaise"`;
const PROMO_STATS = `left join lateral (
  select sum(i.quantity)::int as units, sum(i.line_total_paise)::float8 as revenue, sum((i.base_price_paise - i.unit_price_paise)::bigint * i.quantity)::float8 as discount
  from shop.order_items i join shop.orders o on o.id = i.order_id
  where i.promotion_id = p.id and o.payment_status in ('paid','partially_refunded','refund_pending','refunded') and o.status <> 'cancelled') st on true`;

export async function listPromotions() {
  const sql = db();
  return sql<PromotionRow[]>`select ${sql.unsafe(PROMO_COLS)} from shop.promotions p ${sql.unsafe(PROMO_STATS)} order by p.ends_at desc limit 300`;
}
export async function getPromotion(id: string) {
  const sql = db();
  const [p] = await sql<PromotionRow[]>`select ${sql.unsafe(PROMO_COLS)} from shop.promotions p ${sql.unsafe(PROMO_STATS)} where p.id = ${id}`;
  return p ?? null;
}

/** Items a promotion covers with today's prices and the resulting sale price (and whether another promotion beats it). */
export async function promotionPreview(id: string, limit = 50) {
  return db()<{ sku: string; product: string; productId: string; base: number; sale: number; cost: number | null; current: number; winning: boolean }[]>`
    with pr as (select * from shop.promotions where id = ${id})
    select v.sku, p.name as product, p.id as "productId", v.price_paise as base, v.cost_paise as cost, vp.price_paise as current,
           greatest(100, v.price_paise - case when pr.discount_type = 'percent' then (v.price_paise::bigint * pr.discount_value / 100)::int else pr.discount_value end) as sale,
           vp.promotion_id = pr.id as winning
    from pr, shop.product_variants v join shop.products p on p.id = v.product_id join shop.variant_prices vp on vp.variant_id = v.id
    where v.is_active and p.archived_at is null and (pr.applies_to = 'all'
      or (pr.applies_to = 'products' and p.id = any(pr.product_ids)) or (pr.applies_to = 'brands' and p.brand_id = any(pr.brand_ids))
      or (pr.applies_to = 'categories' and pr.category_ids && shop.category_path(p.category_id)))
    order by p.name, v.sku limit ${limit}`;
}

export async function slugsFor(productIds: string[]) {
  if (!productIds.length) return "";
  const rows = await db()<{ slug: string }[]>`select slug from shop.products where id = any(${productIds}::uuid[]) order by slug`;
  return rows.map((r) => r.slug).join("\n");
}

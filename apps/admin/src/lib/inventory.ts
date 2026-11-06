import "server-only";
import { db } from "./db";

export interface StockRow {
  variantId: string; productId: string; product: string; sku: string; options: Record<string, string>; category: string;
  stock: number; reserved: number; threshold: number; costPaise: number | null; pricePaise: number; lastMovement: Date | null; live: boolean;
}

export async function stockLevels(f: { q?: string; filter?: "low" | "out" | "all"; categoryId?: string; limit?: number }) {
  const sql = db();
  const like = f.q ? `%${f.q.toLowerCase().replace(/[%_\\]/g, "")}%` : null;
  return sql<StockRow[]>`
    select v.id as "variantId", p.id as "productId", p.name as product, v.sku, v.options, c.name as category, v.stock,
           coalesce((select sum(r.quantity) from shop.inventory_reservations r join shop.orders o on o.id = r.order_id
                     where r.variant_id = v.id and r.released_at is null and r.committed_at is null and o.status in ('pending_payment','payment_failed')), 0)::int as reserved,
           v.low_stock_threshold as threshold, v.cost_paise as "costPaise", v.price_paise as "pricePaise",
           (select max(created_at) from shop.stock_movements m where m.variant_id = v.id) as "lastMovement",
           shop.product_live(p.is_active, p.publish_at, p.archived_at) as live
    from shop.product_variants v join shop.products p on p.id = v.product_id join shop.categories c on c.id = p.category_id
    where v.is_active and p.archived_at is null
      ${f.filter === "low" ? sql`and v.stock > 0 and v.stock <= v.low_stock_threshold` : sql``}
      ${f.filter === "out" ? sql`and v.stock = 0` : sql``}
      ${like ? sql`and (lower(p.name) like ${like} or lower(v.sku) like ${like})` : sql``}
      ${f.categoryId ? sql`and p.category_id in (with recursive t as (select id from shop.categories where id = ${f.categoryId} union all select k.id from shop.categories k join t on k.parent_id = t.id) select id from t)` : sql``}
    order by (v.stock = 0) desc, (v.stock <= v.low_stock_threshold) desc, p.name, v.sku
    limit ${f.limit ?? 500}`;
}

export async function inventorySummary() {
  const [r] = await db()<{ skus: number; units: number; valueAtCost: number; valueAtPrice: number; uncosted: number; out: number; low: number; incoming: number; reserved: number }[]>`
    select count(*)::int as skus, coalesce(sum(v.stock), 0)::int as units,
           coalesce(sum(v.stock * v.cost_paise), 0)::bigint::float8 as "valueAtCost",
           coalesce(sum(v.stock * v.price_paise), 0)::bigint::float8 as "valueAtPrice",
           count(*) filter (where v.cost_paise is null and v.stock > 0)::int as uncosted,
           count(*) filter (where v.stock = 0)::int as out,
           count(*) filter (where v.stock > 0 and v.stock <= v.low_stock_threshold)::int as low,
           (select coalesce(sum(i.quantity_ordered - i.quantity_received), 0)::int from shop.purchase_order_items i join shop.purchase_orders po on po.id = i.po_id where po.status in ('ordered','partially_received')) as incoming,
           (select coalesce(sum(r.quantity), 0)::int from shop.inventory_reservations r where r.released_at is null and r.committed_at is null) as reserved
    from shop.product_variants v join shop.products p on p.id = v.product_id where v.is_active and p.archived_at is null`;
  return r!;
}

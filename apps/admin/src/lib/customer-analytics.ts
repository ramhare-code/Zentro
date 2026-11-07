import "server-only";
import { db } from "./db";
import type { DateRange } from "./metrics";

// Based on verified (paid) orders, so unlike visitor analytics it doesn't depend on cookie consent.
const PAID = `o.payment_status in ('paid','partially_refunded','refund_pending','refunded') and o.status <> 'cancelled'`;
// a customer = account if signed in, else their email
const WHO = `coalesce(o.user_id::text, lower(o.email))`;

export async function customerAnalytics(r: DateRange) {
  const sql = db();
  const inRange = sql`(o.placed_at at time zone 'Asia/Kolkata')::date between ${r.from}::date and ${r.to}::date`;
  const paid = sql.unsafe(PAID), who = sql.unsafe(WHO);
  const [[t], byState, byCategory, top, buckets] = await Promise.all([
    sql<{ orders: number; customers: number; revenue: number; newCustomers: number; returningCustomers: number; repeatOrders: number; repeatRate: number | null; itemsPerOrder: number | null }[]>`
      with o2 as (select o.*, ${who} as who from shop.orders o where ${paid}),
      first as (select who, min(placed_at) as first_at from o2 group by who),
      inr as (select o2.*, (f.first_at = o2.placed_at) as first_order from o2 join first f using (who) where (o2.placed_at at time zone 'Asia/Kolkata')::date between ${r.from}::date and ${r.to}::date),
      buyers as (select who, bool_or(first_order) as is_new from inr group by who)
      select (select count(*) from inr)::int as orders,
             (select count(*) from buyers)::int as customers,
             (select coalesce(sum(total_paise), 0) from inr)::bigint::float8 as revenue,
             (select count(*) filter (where is_new) from buyers)::int as "newCustomers",
             (select count(*) filter (where not is_new) from buyers)::int as "returningCustomers",
             (select count(*) filter (where not first_order) from inr)::int as "repeatOrders",
             -- of everyone who has ever bought, the share with 2+ orders
             (select round(100.0 * count(*) filter (where n >= 2) / nullif(count(*), 0), 1) from (select who, count(*) n from o2 group by who) x)::float8 as "repeatRate",
             (select round(avg(q), 2) from (select sum(i.quantity) q from inr join shop.order_items i on i.order_id = inr.id group by inr.id) y)::float8 as "itemsPerOrder"`,
    sql<{ state: string; orders: number; revenue: number }[]>`
      select o.place_of_supply as state, count(*)::int as orders, sum(o.total_paise)::bigint::float8 as revenue
      from shop.orders o where ${paid} and ${inRange} group by 1 order by revenue desc limit 10`,
    sql<{ category: string; units: number; revenue: number }[]>`
      select coalesce(c.name, 'Deleted') as category, sum(i.quantity)::int as units, sum(i.line_total_paise)::bigint::float8 as revenue
      from shop.orders o join shop.order_items i on i.order_id = o.id left join shop.products p on p.id = i.product_id left join shop.categories c on c.id = p.category_id
      where ${paid} and ${inRange} group by 1 order by revenue desc limit 10`,
    sql<{ who: string; email: string; name: string; orders: number; revenue: number; lastAt: Date; customerId: string | null }[]>`
      select ${who} as who, max(o.email) as email, max(o.shipping_address->>'fullName') as name, count(*)::int as orders,
             sum(o.total_paise)::bigint::float8 as revenue, max(o.placed_at) as "lastAt", max(o.user_id::text) as "customerId"
      from shop.orders o where ${paid} and ${inRange} group by 1 order by revenue desc limit 10`,
    sql<{ bucket: string; n: number; customers: number }[]>`
      with per as (select ${who} as who, count(*) as n from shop.orders o where ${paid} group by 1)
      select case when n = 1 then '1 order' when n = 2 then '2 orders' when n <= 4 then '3–4 orders' else '5+ orders' end as bucket,
             min(n)::int as n, count(*)::int as customers from per group by 1 order by 2`,
  ]);
  return { totals: t!, byState, byCategory, top, buckets };
}

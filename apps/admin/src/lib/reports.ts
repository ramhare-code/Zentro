import "server-only";
import { db } from "./db";
import { maskEmail, maskPhone } from "./mask";
import type { DateRange } from "./metrics";
import { rupees } from "./csv-out";

export const REPORTS = {
  orders: { title: "Orders", description: "One row per order: status, customer, place of supply, amounts and coupon." },
  "order-items": { title: "Order lines", description: "One row per item sold, with SKU, HSN, GST rate, price and unit cost." },
  customers: { title: "Customers", description: "Each paying customer with order count, total spent and first/last order." },
  products: { title: "Product sales", description: "Units sold, returned and revenue per variant." },
  coupons: { title: "Coupon usage", description: "Orders, discount given and order value per coupon code." },
  visitors: { title: "Visitors by day", description: "Visitors, sessions, page views and purchases per day (consented analytics)." },
} as const;
export type ReportKey = keyof typeof REPORTS;

const PAID = `o.payment_status in ('paid','partially_refunded','refund_pending','refunded')`;

/** Builds a report as rows (header first). Contact details are masked unless `pii`. */
export async function buildReport(key: ReportKey, r: DateRange, pii: boolean): Promise<unknown[][]> {
  const sql = db();
  const placed = sql`(o.placed_at at time zone 'Asia/Kolkata')::date between ${r.from}::date and ${r.to}::date`;
  const paid = sql.unsafe(PAID);
  const email = (e: string) => (pii ? e : maskEmail(e)), phone = (p: string) => (pii ? p : maskPhone(p));
  switch (key) {
    case "orders": {
      const rows = await sql<{ n: string; at: Date; status: string; pay: string; name: string; email: string; phone: string; state: string; items: number; sub: number; disc: number; ship: number; tax: number; total: number; coupon: string | null; invoice: string | null }[]>`
        select o.order_number as n, o.placed_at as at, o.status, o.payment_status as pay, o.shipping_address->>'fullName' as name, o.email, o.phone, o.place_of_supply as state,
               (select sum(quantity)::int from shop.order_items where order_id = o.id) as items, o.subtotal_paise as sub, o.discount_paise as disc, o.shipping_paise as ship,
               o.tax_paise as tax, o.total_paise as total, o.coupon_code as coupon, (select invoice_number from shop.invoices where order_id = o.id) as invoice
        from shop.orders o where ${paid} and ${placed} order by o.placed_at limit 100000`;
      return [["order_number", "placed_at", "status", "payment_status", "customer", "email", "phone", "state", "items", "subtotal_inr", "discount_inr", "shipping_inr", "gst_inr", "total_inr", "coupon", "invoice"],
        ...rows.map((x) => [x.n, x.at, x.status, x.pay, x.name, email(x.email), phone(x.phone), x.state, x.items, rupees(x.sub), rupees(x.disc), rupees(x.ship), rupees(x.tax), rupees(x.total), x.coupon, x.invoice])];
    }
    case "order-items": {
      const rows = await sql<{ n: string; at: Date; sku: string; name: string; qty: number; ret: number; price: number; base: number | null; line: number; rate: string; hsn: string | null; cost: number | null }[]>`
        select o.order_number as n, o.placed_at as at, i.sku, i.product_name || coalesce(' (' || i.variant_label || ')', '') as name, i.quantity as qty, i.returned_quantity as ret,
               i.unit_price_paise as price, i.base_price_paise as base, i.line_total_paise as line, i.gst_rate::text as rate, i.hsn_code as hsn, i.unit_cost_paise as cost
        from shop.orders o join shop.order_items i on i.order_id = o.id where ${paid} and ${placed} order by o.placed_at, i.sku limit 100000`;
      return [["order_number", "placed_at", "sku", "product", "quantity", "returned", "unit_price_inr", "price_before_promotion_inr", "line_total_inr", "gst_rate", "hsn", "unit_cost_inr"],
        ...rows.map((x) => [x.n, x.at, x.sku, x.name, x.qty, x.ret, rupees(x.price), rupees(x.base), rupees(x.line), Number(x.rate), x.hsn, rupees(x.cost)])];
    }
    case "customers": {
      const rows = await sql<{ name: string; email: string; phone: string; account: boolean; orders: number; spent: number; first: Date; last: Date }[]>`
        select max(o.shipping_address->>'fullName') as name, max(o.email) as email, max(o.phone) as phone, bool_or(o.user_id is not null) as account,
               count(*)::int as orders, sum(o.total_paise)::bigint::float8 as spent, min(o.placed_at) as first, max(o.placed_at) as last
        from shop.orders o where ${paid} and o.status <> 'cancelled' and ${placed}
        group by coalesce(o.user_id::text, lower(o.email)) order by spent desc limit 100000`;
      return [["customer", "email", "phone", "has_account", "orders", "spent_inr", "first_order", "last_order"],
        ...rows.map((x) => [x.name, email(x.email), phone(x.phone), x.account ? "yes" : "no", x.orders, rupees(x.spent), x.first, x.last])];
    }
    case "products": {
      const rows = await sql<{ sku: string; name: string; units: number; ret: number; revenue: number }[]>`
        select i.sku, min(i.product_name || coalesce(' (' || i.variant_label || ')', '')) as name, sum(i.quantity)::int as units, sum(i.returned_quantity)::int as ret,
               sum(i.line_total_paise)::bigint::float8 as revenue
        from shop.orders o join shop.order_items i on i.order_id = o.id where ${paid} and o.status <> 'cancelled' and ${placed}
        group by i.sku order by revenue desc limit 100000`;
      return [["sku", "product", "units_sold", "units_returned", "revenue_inr"], ...rows.map((x) => [x.sku, x.name, x.units, x.ret, rupees(x.revenue)])];
    }
    case "coupons": {
      const rows = await sql<{ code: string; orders: number; discount: number; revenue: number }[]>`
        select o.coupon_code as code, count(*)::int as orders, sum(o.discount_paise)::bigint::float8 as discount, sum(o.total_paise)::bigint::float8 as revenue
        from shop.orders o where ${paid} and o.status <> 'cancelled' and o.coupon_code is not null and ${placed} group by 1 order by 2 desc`;
      return [["coupon", "orders", "discount_inr", "order_value_inr"], ...rows.map((x) => [x.code, x.orders, rupees(x.discount), rupees(x.revenue)])];
    }
    case "visitors": {
      const rows = await sql<{ day: string; visitors: number; sessions: number; views: number; purchases: number }[]>`
        select to_char((occurred_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, count(distinct visitor_id)::int as visitors, count(distinct session_id)::int as sessions,
               count(*) filter (where event = 'page_view')::int as views, count(distinct session_id) filter (where event = 'purchase')::int as purchases
        from shop.analytics_events where (occurred_at at time zone 'Asia/Kolkata')::date between ${r.from}::date and ${r.to}::date group by 1 order by 1`;
      return [["date", "visitors", "sessions", "page_views", "purchasing_sessions"], ...rows.map((x) => [x.day, x.visitors, x.sessions, x.views, x.purchases])];
    }
  }
}

import "server-only";
import { REVENUE_STATUSES, type OrderStatus } from "@zentro/commerce";
import { z } from "zod";
import { db } from "./db";

const TZ = "Asia/Kolkata";
export const RANGE_PRESETS = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 } as const;
export type RangeKey = keyof typeof RANGE_PRESETS | "custom";

export interface DateRange { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "month" }

const iso = (d: Date) => d.toISOString().slice(0, 10);
function todayIst(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

/** Parses ?range=30d or ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST calendar days, inclusive). */
export function parseRange(sp: Record<string, string | undefined>): DateRange {
  const from = z.string().date().safeParse(sp.from).data;
  const to = z.string().date().safeParse(sp.to).data;
  if (from && to && from <= to) {
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    if (days <= 731) return { key: "custom", from, to, days, bucket: days > 92 ? "month" : "day" };
  }
  const key = (sp.range && sp.range in RANGE_PRESETS ? sp.range : "30d") as keyof typeof RANGE_PRESETS;
  const days = RANGE_PRESETS[key];
  const end = todayIst();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return { key, from: iso(start), to: iso(end), days, bucket: days > 92 ? "month" : "day" };
}

// Orders that represent a verified sale (payment captured), regardless of later refunds.
const PAID = ["paid", "refund_pending", "partially_refunded", "refunded"];

export async function getDashboard(range: DateRange) {
  const sql = db();
  const start = sql`(${range.from}::date at time zone ${TZ})`;
  const end = sql`((${range.to}::date + 1) at time zone ${TZ})`;
  const prevStart = sql`((${range.from}::date - ${range.days}::int) at time zone ${TZ})`;

  const [kpi] = await sql<{
    gross: number; prevGross: number; paidOrders: number; prevPaidOrders: number; refunds: number;
    activeProducts: number; outOfStock: number; customers: number; newCustomers: number;
    buyers: number; returningBuyers: number; pendingFulfilment: number;
  }[]>`
    with paid as (
      select o.*, coalesce(o.user_id::text, lower(o.email)) as buyer
      from shop.orders o where o.payment_status = any(${PAID}::text[]) and o.placed_at is not null
    )
    select
      coalesce((select sum(total_paise) from paid where placed_at >= ${start} and placed_at < ${end}), 0)::bigint::float8 as gross,
      coalesce((select sum(total_paise) from paid where placed_at >= ${prevStart} and placed_at < ${start}), 0)::bigint::float8 as "prevGross",
      (select count(*) from paid where placed_at >= ${start} and placed_at < ${end})::int as "paidOrders",
      (select count(*) from paid where placed_at >= ${prevStart} and placed_at < ${start})::int as "prevPaidOrders",
      coalesce((select sum(amount_paise) from shop.refunds where status = 'processed' and processed_at >= ${start} and processed_at < ${end}), 0)::bigint::float8 as refunds,
      (select count(*) from shop.products where is_active)::int as "activeProducts",
      (select count(*) from shop.product_variants v join shop.products p on p.id = v.product_id where p.is_active and v.is_active and v.stock = 0)::int as "outOfStock",
      (select count(*) from auth.users)::int as customers,
      (select count(*) from auth.users where created_at >= ${start} and created_at < ${end})::int as "newCustomers",
      (select count(distinct buyer) from paid where placed_at >= ${start} and placed_at < ${end})::int as buyers,
      (select count(distinct p.buyer) from paid p where p.placed_at >= ${start} and p.placed_at < ${end}
         and exists (select 1 from paid e where e.buyer = p.buyer and e.placed_at < ${start}))::int as "returningBuyers",
      (select count(*) from shop.orders where status in ('confirmed','processing','packed'))::int as "pendingFulfilment"`;

  const bucket = range.bucket === "month" ? sql`'month'` : sql`'day'`;
  const series = await sql<{ bucket: string; revenue: number; orders: number }[]>`
    with b as (
      select generate_series(date_trunc(${bucket}, ${range.from}::date), ${range.to}::date, ('1 ' || ${bucket})::interval)::date as bucket
    ), o as (
      select date_trunc(${bucket}, (placed_at at time zone ${TZ}))::date as bucket, total_paise
      from shop.orders
      where payment_status = any(${PAID}::text[]) and placed_at >= ${start} and placed_at < ${end}
    )
    select to_char(b.bucket, 'YYYY-MM-DD') as bucket,
           coalesce(sum(o.total_paise), 0)::bigint::float8 as revenue, count(o.total_paise)::int as orders
    from b left join o on o.bucket = b.bucket
    group by b.bucket order by b.bucket`;

  const statuses = await sql<{ status: OrderStatus; n: number }[]>`
    select status, count(*)::int as n from shop.orders
    where created_at >= ${start} and created_at < ${end} group by status order by n desc`;

  const lowStock = await sql<{ sku: string; name: string; options: Record<string, string>; stock: number; threshold: number }[]>`
    select v.sku, p.name, v.options, v.stock, v.low_stock_threshold as threshold
    from shop.product_variants v join shop.products p on p.id = v.product_id
    where p.is_active and v.is_active and v.stock <= v.low_stock_threshold
    order by v.stock, p.name limit 8`;

  return { kpi: kpi!, series, statuses, lowStock, revenueStatuses: REVENUE_STATUSES };
}

export interface ActivityItem { at: Date; kind: "order" | "admin"; text: string; actor: string | null; href?: string }

export async function getRecentActivity(includeAudit: boolean): Promise<ActivityItem[]> {
  const sql = db();
  const [orderEvents, auditRows] = await Promise.all([
    sql<{ at: Date; orderNumber: string; orderId: string; status: string; actor: string; note: string | null }[]>`
      select e.created_at as at, o.order_number as "orderNumber", o.id as "orderId", e.status, e.actor, e.note
      from shop.order_events e join shop.orders o on o.id = e.order_id
      order by e.created_at desc limit 10`,
    includeAudit
      ? sql<{ at: Date; action: string; email: string | null; entityType: string | null }[]>`
          select occurred_at as at, action, staff_email as email, entity_type as "entityType" from shop.audit_log
          where action not like 'auth.%' order by id desc limit 10`
      : Promise.resolve([]),
  ]);
  return [
    ...orderEvents.map((e) => ({ at: e.at, kind: "order" as const, text: `Order ${e.orderNumber} → ${e.status.replace(/_/g, " ")}${e.note ? ` (${e.note})` : ""}`, actor: e.actor, href: `/orders?q=${e.orderNumber}` })),
    ...auditRows.map((a) => ({ at: a.at, kind: "admin" as const, text: a.action.replace(/[._]/g, " "), actor: a.email })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);
}

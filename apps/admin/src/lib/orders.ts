import "server-only";
import { ORDER_STATUSES, type OrderStatus } from "@zentro/commerce";
import { z } from "zod";
import { db } from "./db";

export const PAGE_SIZE = 25;

export function parseOrderFilters(sp: Record<string, string | undefined>) {
  return {
    q: sp.q?.replace(/\s+/g, " ").trim().slice(0, 100) || undefined,
    status: (ORDER_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as OrderStatus) : undefined,
    payment: ["pending", "paid", "failed", "refund_pending", "partially_refunded", "refunded"].includes(sp.payment ?? "") ? sp.payment : undefined,
    from: z.string().date().safeParse(sp.from).data,
    to: z.string().date().safeParse(sp.to).data,
    page: z.coerce.number().int().min(1).max(10_000).safeParse(sp.page).data ?? 1,
  };
}
export type OrderFilters = ReturnType<typeof parseOrderFilters>;

export async function listOrders(f: OrderFilters) {
  const sql = db();
  const like = f.q ? `%${f.q.toLowerCase().replace(/[%_\\]/g, "")}%` : null;
  const rows = await sql<{ id: string; orderNumber: string; createdAt: Date; email: string; phone: string; name: string; status: OrderStatus; paymentStatus: string; totalPaise: number; items: number; full: number }[]>`
    select o.id, o.order_number as "orderNumber", o.created_at as "createdAt", o.email, o.phone, o.shipping_address->>'fullName' as name,
           o.status, o.payment_status as "paymentStatus", o.total_paise as "totalPaise",
           (select coalesce(sum(quantity), 0)::int from shop.order_items i where i.order_id = o.id) as items,
           count(*) over ()::int as full
    from shop.orders o
    where true
      ${like ? sql`and (lower(o.order_number) like ${like} or lower(o.email) like ${like} or o.phone like ${like} or lower(o.shipping_address->>'fullName') like ${like})` : sql``}
      ${f.status ? sql`and o.status = ${f.status}` : sql``}
      ${f.payment ? sql`and o.payment_status = ${f.payment}` : sql``}
      ${f.from ? sql`and o.created_at >= (${f.from}::date at time zone 'Asia/Kolkata')` : sql``}
      ${f.to ? sql`and o.created_at < ((${f.to}::date + 1) at time zone 'Asia/Kolkata')` : sql``}
    order by o.created_at desc
    limit ${PAGE_SIZE} offset ${(f.page - 1) * PAGE_SIZE}`;
  const counts = await sql<{ status: OrderStatus; n: number }[]>`select status, count(*)::int as n from shop.orders group by status`;
  return { rows, total: rows[0]?.full ?? 0, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<OrderStatus, number>> };
}

export async function getOrderDetail(id: string) {
  const sql = db();
  const [o] = await sql<{
    id: string; orderNumber: string; status: OrderStatus; paymentStatus: string; email: string; phone: string; whatsapp: boolean;
    address: Record<string, string>; placeOfSupply: string; subtotalPaise: number; discountPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number;
    couponCode: string | null; createdAt: Date; placedAt: Date | null; cancelReason: string | null; invoiceNumber: string | null;
  }[]>`
    select o.id, o.order_number as "orderNumber", o.status, o.payment_status as "paymentStatus", o.email, o.phone, o.whatsapp_updates as whatsapp,
           o.shipping_address as address, o.place_of_supply as "placeOfSupply", o.subtotal_paise as "subtotalPaise", o.discount_paise as "discountPaise",
           o.shipping_paise as "shippingPaise", o.tax_paise as "taxPaise", o.total_paise as "totalPaise", o.coupon_code as "couponCode",
           o.created_at as "createdAt", o.placed_at as "placedAt", o.cancel_reason as "cancelReason", inv.invoice_number as "invoiceNumber"
    from shop.orders o left join shop.invoices inv on inv.order_id = o.id where o.id = ${id}`;
  if (!o) return null;
  const [items, events, payments, shipments, refunds, notes, messages] = await Promise.all([
    sql<{ id: string; productName: string; variantLabel: string | null; sku: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }[]>`
      select id, product_name as "productName", variant_label as "variantLabel", sku, quantity, unit_price_paise as "unitPricePaise", line_total_paise as "lineTotalPaise"
      from shop.order_items where order_id = ${id} order by product_name`,
    sql<{ status: string; note: string | null; actor: string; createdAt: Date }[]>`select status, note, actor, created_at as "createdAt" from shop.order_events where order_id = ${id} order by created_at desc`,
    sql<{ providerOrderId: string; providerPaymentId: string | null; amountPaise: number; status: string; method: string | null; errorDescription: string | null; verifiedAt: Date | null; createdAt: Date }[]>`
      select provider_order_id as "providerOrderId", provider_payment_id as "providerPaymentId", amount_paise as "amountPaise", status, method,
             error_description as "errorDescription", verified_at as "verifiedAt", created_at as "createdAt"
      from shop.payments where order_id = ${id} order by created_at desc`,
    sql<{ carrier: string; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: Date | null; deliveredAt: Date | null }[]>`
      select carrier, tracking_number as "trackingNumber", tracking_url as "trackingUrl", status, shipped_at as "shippedAt", delivered_at as "deliveredAt" from shop.shipments where order_id = ${id}`,
    sql<{ amountPaise: number; status: string; providerRefundId: string | null; createdAt: Date }[]>`
      select amount_paise as "amountPaise", status, provider_refund_id as "providerRefundId", created_at as "createdAt" from shop.refunds where order_id = ${id} order by created_at`,
    sql<{ body: string; staffEmail: string | null; createdAt: Date }[]>`select body, staff_email as "staffEmail", created_at as "createdAt" from shop.order_notes where order_id = ${id} order by created_at desc`,
    sql<{ channel: string; template: string; status: string; lastError: string | null; createdAt: Date; sentAt: Date | null }[]>`
      select channel, template, status, last_error as "lastError", created_at as "createdAt", sent_at as "sentAt"
      from shop.notification_outbox where payload->>'orderId' = ${id} order by created_at desc`,
  ]);
  return { ...o, items, events, payments, shipments, refunds, notes, messages };
}

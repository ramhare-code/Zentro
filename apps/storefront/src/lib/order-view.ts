import "server-only";
import type { OrderStatus } from "@zentro/commerce";
import { db } from "./db";

export interface OrderView {
  id: string; orderNumber: string; status: OrderStatus; paymentStatus: string; email: string; phone: string;
  subtotalPaise: number; discountPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number; couponCode: string | null;
  address: { fullName: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; stateCode: string; pincode: string };
  placeOfSupply: string; placedAt: Date | null; createdAt: Date; estFrom: string | null; estTo: string | null; cancelReason: string | null;
  reservationOpen: boolean;
  items: { id: string; productName: string; variantLabel: string | null; sku: string; imageUrl: string | null; hsnCode: string | null; quantity: number; unitPricePaise: number; lineTotalPaise: number; discountPaise: number; gstRate: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; productSlug: string | null }[];
  events: { status: string; note: string | null; createdAt: Date }[];
  shipments: { carrier: string; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: Date | null; deliveredAt: Date | null; events: { status: string; location: string | null; description: string | null; occurredAt: Date }[] }[];
  refunds: { amountPaise: number; status: string; createdAt: Date; processedAt: Date | null }[];
  invoiceNumber: string | null; invoiceDate: Date | null;
}

export async function getOrderView(orderId: string): Promise<OrderView | null> {
  const sql = db();
  const [o] = await sql<Omit<OrderView, "items" | "events" | "shipments" | "refunds">[]>`
    select o.id, o.order_number as "orderNumber", o.status, o.payment_status as "paymentStatus", o.email, o.phone,
           o.subtotal_paise as "subtotalPaise", o.discount_paise as "discountPaise", o.shipping_paise as "shippingPaise",
           o.tax_paise as "taxPaise", o.total_paise as "totalPaise", o.coupon_code as "couponCode", o.shipping_address as address,
           o.place_of_supply as "placeOfSupply", o.placed_at as "placedAt", o.created_at as "createdAt",
           to_char(o.est_delivery_from, 'YYYY-MM-DD') as "estFrom", to_char(o.est_delivery_to, 'YYYY-MM-DD') as "estTo",
           o.cancel_reason as "cancelReason",
           (o.status in ('pending_payment','payment_failed') and o.reservation_expires_at > now()) as "reservationOpen",
           inv.invoice_number as "invoiceNumber", inv.issued_at as "invoiceDate"
    from shop.orders o left join shop.invoices inv on inv.order_id = o.id where o.id = ${orderId}`;
  if (!o) return null;
  const [items, events, shipments, refunds] = await Promise.all([
    sql<OrderView["items"]>`
      select i.id, i.product_name as "productName", i.variant_label as "variantLabel", i.sku, i.image_url as "imageUrl", i.hsn_code as "hsnCode",
             i.quantity, i.unit_price_paise as "unitPricePaise", i.line_total_paise as "lineTotalPaise", i.discount_paise as "discountPaise",
             i.gst_rate::text as "gstRate", i.taxable_paise as "taxablePaise", i.cgst_paise as "cgstPaise", i.sgst_paise as "sgstPaise", i.igst_paise as "igstPaise",
             p.slug as "productSlug"
      from shop.order_items i left join shop.products p on p.id = i.product_id where i.order_id = ${orderId} order by i.product_name`,
    sql<OrderView["events"]>`select status, note, created_at as "createdAt" from shop.order_events where order_id = ${orderId} and actor <> 'operations' or (order_id = ${orderId} and actor = 'operations' and note is null) order by created_at`,
    sql<OrderView["shipments"]>`
      select s.carrier, s.tracking_number as "trackingNumber", s.tracking_url as "trackingUrl", s.status, s.shipped_at as "shippedAt", s.delivered_at as "deliveredAt",
             coalesce((select json_agg(json_build_object('status', e.status, 'location', e.location, 'description', e.description, 'occurredAt', e.occurred_at) order by e.occurred_at desc)
                       from shop.shipment_events e where e.shipment_id = s.id), '[]') as events
      from shop.shipments s where s.order_id = ${orderId} order by s.created_at`,
    sql<OrderView["refunds"]>`select amount_paise as "amountPaise", status, created_at as "createdAt", processed_at as "processedAt" from shop.refunds where order_id = ${orderId} order by created_at`,
  ]);
  return { ...o, items, events, shipments, refunds };
}

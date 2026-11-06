// Order lifecycle with transactional integrity. Server-side only.
// Shared by the storefront (checkout, cancellation), payment webhooks
// and the admin (fulfilment), so every path enforces the same rules.
import { createHash, randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "./db";
import { canTransition, type OrderStatus } from "./order-status";
import { couponDiscount, priceLines } from "./pricing";
import { STATE_CODES } from "./states";

export class CheckoutError extends Error {}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const RESERVATION_MINUTES = 30;

export interface Address {
  fullName: string; phone: string; line1: string; line2?: string; landmark?: string;
  city: string; stateCode: string; pincode: string;
}

export interface PlaceOrderInput {
  lines: { variantId: string; quantity: number }[];
  email: string;
  phone: string;
  address: Address;
  couponCode?: string;
  idempotencyKey: string;
  userId?: string | null;
  whatsappUpdates: boolean;
  sellerStateCode: string;
}

export interface Quote {
  lines: {
    variantId: string; productId: string; productName: string; variantLabel: string | null; sku: string;
    imageUrl: string | null; hsnCode: string | null; quantity: number; unitPricePaise: number; unitMrpPaise: number;
    discountPaise: number; lineTotalPaise: number; gstRate: number; taxablePaise: number;
    cgstPaise: number; sgstPaise: number; igstPaise: number;
  }[];
  subtotalPaise: number;
  discountPaise: number;
  couponId: string | null;
  couponCode: string | null;
  couponMessage: string | null;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  estDaysMin: number;
  estDaysMax: number;
}

/**
 * Prices a cart from the database (never from the client). When `lock` is
 * true the variant rows are locked FOR UPDATE so stock can be reserved
 * atomically by the caller in the same transaction.
 */
export async function quote(
  tx: TransactionSql | Sql,
  input: Pick<PlaceOrderInput, "lines" | "couponCode" | "email" | "userId" | "sellerStateCode"> & { stateCode: string; pincode: string },
  lock = false,
): Promise<Quote> {
  const qty = new Map<string, number>();
  for (const l of input.lines) qty.set(l.variantId, Math.min(10, (qty.get(l.variantId) ?? 0) + l.quantity));
  const ids = [...qty.keys()];
  if (!ids.length) throw new CheckoutError("Your cart is empty.");
  if (ids.length > 30) throw new CheckoutError("Too many different items in one order.");
  if (!STATE_CODES.includes(input.stateCode)) throw new CheckoutError("Choose a valid state.");
  if (!/^[1-9][0-9]{5}$/.test(input.pincode)) throw new CheckoutError("Enter a valid 6-digit pincode.");

  const rows = await tx<{
    variantId: string; productId: string; productName: string; options: Record<string, string>; sku: string;
    pricePaise: number; mrpPaise: number; stock: number; available: boolean; gstRate: string; hsnCode: string | null; imageUrl: string | null;
  }[]>`
    select v.id as "variantId", p.id as "productId", p.name as "productName", v.options, v.sku,
           v.price_paise as "pricePaise", v.mrp_paise as "mrpPaise", v.stock,
           (v.is_active and p.is_active) as available, p.gst_rate::text as "gstRate", p.hsn_code as "hsnCode",
           coalesce((select url from shop.product_media m where m.id = v.media_id),
                    (select url from shop.product_media m where m.product_id = p.id and m.kind = 'image' order by sort_order limit 1)) as "imageUrl"
    from shop.product_variants v join shop.products p on p.id = v.product_id
    where v.id = any(${ids}::uuid[])
    order by v.id
    ${lock ? tx`for update of v` : tx``}`;

  if (rows.length !== ids.length) throw new CheckoutError("Some items in your cart are no longer available. Please review your cart.");
  for (const r of rows) {
    const want = qty.get(r.variantId)!;
    if (!r.available) throw new CheckoutError(`${r.productName} is no longer available.`);
    if (r.stock < want) {
      throw new CheckoutError(r.stock === 0 ? `${r.productName} just sold out.` : `Only ${r.stock} left of ${r.productName}. Please reduce the quantity.`);
    }
  }

  const subtotal = rows.reduce((a, r) => a + r.pricePaise * qty.get(r.variantId)!, 0);

  // Coupon — validated entirely on the server.
  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let couponMessage: string | null = null;
  const code = input.couponCode?.trim().toUpperCase();
  if (code) {
    const [c] = await tx<{
      id: string; code: string; discountType: "percent" | "fixed"; discountValue: number; maxDiscountPaise: number | null;
      minOrderPaise: number; usageLimit: number | null; usedCount: number; perUserLimit: number | null; firstOrderOnly: boolean; live: boolean;
    }[]>`
      select id, code, discount_type as "discountType", discount_value as "discountValue", max_discount_paise as "maxDiscountPaise",
             min_order_paise as "minOrderPaise", usage_limit as "usageLimit", used_count as "usedCount",
             per_user_limit as "perUserLimit", first_order_only as "firstOrderOnly",
             (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) as live
      from shop.coupons where code = ${code}`;
    const paidBefore = c
      ? await tx<{ total: number; withCoupon: number }[]>`
          select count(*)::int as total, count(*) filter (where coupon_id = ${c.id})::int as "withCoupon"
          from shop.orders where payment_status in ('paid','partially_refunded','refunded','refund_pending')
            and (lower(email) = ${input.email.toLowerCase()} or (${input.userId ?? null}::uuid is not null and user_id = ${input.userId ?? null}))`
      : [];
    const used = paidBefore[0];
    if (!c || !c.live) couponMessage = "This coupon code isn’t valid.";
    else if (c.usageLimit !== null && c.usedCount >= c.usageLimit) couponMessage = "This coupon has been fully redeemed.";
    else if (c.perUserLimit !== null && used && used.withCoupon >= c.perUserLimit) couponMessage = "You’ve already used this coupon.";
    else if (c.firstOrderOnly && used && used.total > 0) couponMessage = "This coupon is for first orders only.";
    else if (subtotal < c.minOrderPaise) couponMessage = `Add items worth ₹${Math.ceil((c.minOrderPaise - subtotal) / 100)} more to use this coupon.`;
    else {
      discount = couponDiscount(subtotal, c);
      couponId = c.id;
      couponCode = c.code;
      couponMessage = `${c.code} applied.`;
    }
  }

  const [blocked] = await tx`select 1 from shop.unserviceable_pincodes where pincode = ${input.pincode}`;
  if (blocked) throw new CheckoutError("Sorry, we don’t deliver to this pincode yet.");
  const afterDiscount = subtotal - discount;
  const [rate] = await tx<{ feePaise: number; min: number; max: number }[]>`
    select fee_paise as "feePaise", est_days_min as min, est_days_max as max from shop.shipping_rates
    where is_active
      and (state_codes is null or ${input.stateCode} = any(state_codes))
      and (pincode_prefixes is null or exists (select 1 from unnest(pincode_prefixes) p where ${input.pincode} like p || '%'))
      and min_subtotal_paise <= ${afterDiscount}
      and (max_subtotal_paise is null or max_subtotal_paise >= ${afterDiscount})
    order by priority limit 1`;
  if (!rate) throw new CheckoutError("Sorry, we can’t deliver to this address yet.");

  const intra = input.stateCode === input.sellerStateCode;
  const priced = priceLines(
    rows.map((r) => ({ variantId: r.variantId, quantity: qty.get(r.variantId)!, unitPricePaise: r.pricePaise, gstRate: Number(r.gstRate) })),
    discount,
    intra,
  );
  const lines = priced.map((p, i) => {
    const r = rows[i]!;
    const label = Object.values(r.options).join(" / ");
    return {
      variantId: r.variantId, productId: r.productId, productName: r.productName, variantLabel: label || null, sku: r.sku,
      imageUrl: r.imageUrl, hsnCode: r.hsnCode, quantity: p.quantity, unitPricePaise: r.pricePaise, unitMrpPaise: r.mrpPaise,
      discountPaise: p.discountPaise, lineTotalPaise: p.lineTotalPaise, gstRate: p.gstRate, taxablePaise: p.taxablePaise,
      cgstPaise: p.cgstPaise, sgstPaise: p.sgstPaise, igstPaise: p.igstPaise,
    };
  });
  const tax = lines.reduce((a, l) => a + l.cgstPaise + l.sgstPaise + l.igstPaise, 0);
  return {
    lines, subtotalPaise: subtotal, discountPaise: discount, couponId, couponCode, couponMessage,
    shippingPaise: rate.feePaise, taxPaise: tax, totalPaise: afterDiscount + rate.feePaise,
    estDaysMin: rate.min, estDaysMax: rate.max,
  };
}

export interface PlacedOrder { orderId: string; orderNumber: string; totalPaise: number; guestToken: string; existing: boolean }

/** Creates a pending order and reserves stock atomically. Idempotent per `idempotencyKey`. */
export async function placeOrder(sql: Sql, input: PlaceOrderInput): Promise<PlacedOrder> {
  const guestToken = randomBytes(24).toString("base64url");
  return sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string; orderNumber: string; totalPaise: number; status: string }[]>`
      select id, order_number as "orderNumber", total_paise as "totalPaise", status from shop.orders
      where idempotency_key = ${input.idempotencyKey} for update`;
    if (existing) {
      await tx`update shop.orders set guest_access_hash = ${sha256(guestToken)} where id = ${existing.id}`;
      return { orderId: existing.id, orderNumber: existing.orderNumber, totalPaise: existing.totalPaise, guestToken, existing: true };
    }

    const q = await quote(tx, { ...input, stateCode: input.address.stateCode, pincode: input.address.pincode }, true);
    if (input.couponCode && !q.couponId) throw new CheckoutError(q.couponMessage ?? "This coupon can’t be used.");

    const [seq] = await tx<{ n: string; ymd: string }[]>`
      select nextval('shop.order_number_seq')::text as n, to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') as ymd`;
    const { n, ymd } = seq!;
    const orderNumber = `ZN${ymd}${n}`;
    const today = new Date();
    const addDays = (d: number) => new Date(today.getTime() + d * 86_400_000).toISOString().slice(0, 10);

    const [o] = await tx<{ id: string }[]>`
      insert into shop.orders (
        order_number, user_id, email, phone, guest_access_hash, status, payment_status,
        subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise, coupon_id, coupon_code,
        shipping_address, place_of_supply, est_delivery_from, est_delivery_to, idempotency_key,
        reservation_expires_at, whatsapp_updates)
      values (
        ${orderNumber}, ${input.userId ?? null}, ${input.email.toLowerCase()}, ${input.phone}, ${sha256(guestToken)},
        'pending_payment', 'pending', ${q.subtotalPaise}, ${q.discountPaise}, ${q.shippingPaise}, ${q.taxPaise}, ${q.totalPaise},
        ${q.couponId}, ${q.couponCode}, ${tx.json(input.address as never)}, ${input.address.stateCode},
        ${addDays(q.estDaysMin)}, ${addDays(q.estDaysMax)}, ${input.idempotencyKey},
        now() + make_interval(mins => ${RESERVATION_MINUTES}), ${input.whatsappUpdates})
      returning id`;
    const orderId = o!.id;

    for (const l of q.lines) {
      await tx`
        insert into shop.order_items (order_id, product_id, variant_id, product_name, variant_label, sku, image_url, hsn_code,
          quantity, unit_price_paise, unit_mrp_paise, discount_paise, line_total_paise, gst_rate, taxable_paise, cgst_paise, sgst_paise, igst_paise)
        values (${orderId}, ${l.productId}, ${l.variantId}, ${l.productName}, ${l.variantLabel}, ${l.sku}, ${l.imageUrl}, ${l.hsnCode},
          ${l.quantity}, ${l.unitPricePaise}, ${l.unitMrpPaise}, ${l.discountPaise}, ${l.lineTotalPaise}, ${l.gstRate}, ${l.taxablePaise},
          ${l.cgstPaise}, ${l.sgstPaise}, ${l.igstPaise})`;
      // rows are locked by quote(); this cannot oversell (CHECK stock >= 0 is the last line of defence)
      await tx`update shop.product_variants set stock = stock - ${l.quantity} where id = ${l.variantId}`;
      await tx`insert into shop.inventory_reservations (order_id, variant_id, quantity, expires_at)
               values (${orderId}, ${l.variantId}, ${l.quantity}, now() + make_interval(mins => ${RESERVATION_MINUTES}))`;
    }
    await tx`insert into shop.order_events (order_id, status, note, actor) values (${orderId}, 'pending_payment', 'Order created; stock reserved while awaiting payment', 'customer')`;
    return { orderId, orderNumber, totalPaise: q.totalPaise, guestToken, existing: false };
  });
}

/** Adds transactional notifications to the outbox (delivered by the messaging worker). Idempotent. */
export async function enqueueOrderNotification(tx: TransactionSql | Sql, orderId: string, template: string, extra: Record<string, unknown> = {}) {
  const [o] = await tx<{ email: string; phone: string; whatsapp: boolean }[]>`
    select email, phone, whatsapp_updates as whatsapp from shop.orders where id = ${orderId}`;
  if (!o) return;
  const payload = tx.json({ orderId, ...extra } as never);
  const targets: [string, string][] = [["email", o.email], ["sms", o.phone]];
  if (o.whatsapp) targets.push(["whatsapp", o.phone]);
  for (const [channel, recipient] of targets) {
    await tx`
      insert into shop.notification_outbox (channel, recipient, template, payload, dedupe_key)
      values (${channel}, ${recipient}, ${template}, ${payload}, ${`${template}:${orderId}:${channel}${extra.dedupeSuffix ? ":" + String(extra.dedupeSuffix) : ""}`})
      on conflict (dedupe_key) do nothing`;
  }
}

export type ConfirmResult =
  | { kind: "confirmed"; orderId: string; orderNumber: string; alreadyConfirmed: boolean }
  | { kind: "needs_refund"; orderId: string; orderNumber: string; paymentRowId: string; providerPaymentId: string; amountPaise: number }
  | { kind: "rejected"; reason: string };

/**
 * Marks an order paid after the payment has been VERIFIED with the gateway
 * (signature + fetched payment status/amount). Idempotent: safe to call from
 * both the checkout callback and the webhook.
 */
export async function confirmPaidOrder(
  sql: Sql,
  p: { providerOrderId: string; providerPaymentId: string; amountPaise: number; currency: string; status: string; method?: string | null },
): Promise<ConfirmResult> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ paymentId: string; orderId: string; orderNumber: string; orderStatus: OrderStatus; totalPaise: number; paymentStatus: string; couponId: string | null }[]>`
      select pay.id as "paymentId", o.id as "orderId", o.order_number as "orderNumber", o.status as "orderStatus",
             o.total_paise as "totalPaise", o.payment_status as "paymentStatus", o.coupon_id as "couponId"
      from shop.payments pay join shop.orders o on o.id = pay.order_id
      where pay.provider_order_id = ${p.providerOrderId}
      for update of pay, o`;
    if (!row) return { kind: "rejected", reason: "unknown order" };
    if (p.status !== "captured") return { kind: "rejected", reason: `payment status ${p.status}` };
    if (p.amountPaise !== row.totalPaise || p.currency !== "INR") return { kind: "rejected", reason: "amount mismatch" };

    await tx`update shop.payments set status = 'captured', provider_payment_id = ${p.providerPaymentId}, method = ${p.method ?? null},
             verified_at = coalesce(verified_at, now()), error_code = null, error_description = null where id = ${row.paymentId}`;

    if (row.paymentStatus === "paid" || ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"].includes(row.orderStatus)) {
      return { kind: "confirmed", orderId: row.orderId, orderNumber: row.orderNumber, alreadyConfirmed: true };
    }

    if (row.orderStatus === "cancelled") {
      // Paid after the reservation expired: try to take the stock again.
      const items = await tx<{ variantId: string; quantity: number }[]>`
        select variant_id as "variantId", quantity from shop.order_items where order_id = ${row.orderId} order by variant_id`;
      const locked = await tx<{ id: string; stock: number }[]>`
        select id, stock from shop.product_variants where id = any(${items.map((i) => i.variantId)}::uuid[]) order by id for update`;
      const ok = items.every((i) => (locked.find((l) => l.id === i.variantId)?.stock ?? 0) >= i.quantity);
      if (!ok) {
        await tx`update shop.orders set payment_status = 'refund_pending' where id = ${row.orderId}`;
        await tx`insert into shop.order_events (order_id, status, note, actor) values (${row.orderId}, 'cancelled', 'Payment received after the order expired and stock was no longer available; full refund issued', 'system')`;
        return { kind: "needs_refund", orderId: row.orderId, orderNumber: row.orderNumber, paymentRowId: row.paymentId, providerPaymentId: p.providerPaymentId, amountPaise: p.amountPaise };
      }
      for (const i of items) await tx`update shop.product_variants set stock = stock - ${i.quantity} where id = ${i.variantId}`;
      await tx`update shop.inventory_reservations set released_at = null, committed_at = now() where order_id = ${row.orderId}`;
      await tx`update shop.orders set cancelled_at = null, cancel_reason = null where id = ${row.orderId}`;
    } else {
      await tx`update shop.inventory_reservations set committed_at = now() where order_id = ${row.orderId} and released_at is null`;
    }

    await tx`update shop.orders set status = 'confirmed', payment_status = 'paid', placed_at = now(), reservation_expires_at = null where id = ${row.orderId}`;
    await tx`update shop.products p set units_sold = p.units_sold + i.quantity from shop.order_items i where i.order_id = ${row.orderId} and i.product_id = p.id`;
    if (row.couponId) await tx`update shop.coupons set used_count = used_count + 1 where id = ${row.couponId}`;

    const [fyRow] = await tx<{ fy: string }[]>`
      select case when extract(month from now() at time zone 'Asia/Kolkata') >= 4
                  then to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || to_char((now() at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
                  else to_char((now() at time zone 'Asia/Kolkata') - interval '1 year', 'YYYY') || '-' || to_char(now() at time zone 'Asia/Kolkata', 'YY') end as fy`;
    const fy = fyRow!.fy;
    await tx`insert into shop.invoices (order_id, invoice_number)
             values (${row.orderId}, ${"ZN/" + fy + "/"} || lpad(nextval('shop.invoice_number_seq')::text, 6, '0'))
             on conflict (order_id) do nothing`;
    await tx`insert into shop.order_events (order_id, status, note, actor) values (${row.orderId}, 'confirmed', 'Payment verified with Razorpay', 'payment_gateway')`;
    await enqueueOrderNotification(tx, row.orderId, "order_confirmed");
    return { kind: "confirmed", orderId: row.orderId, orderNumber: row.orderNumber, alreadyConfirmed: false };
  });
}

export async function recordPaymentFailure(sql: Sql, providerOrderId: string, providerPaymentId: string | null, code: string | null, description: string | null) {
  await sql.begin(async (tx) => {
    const [pay] = await tx<{ id: string; orderId: string }[]>`
      select id, order_id as "orderId" from shop.payments where provider_order_id = ${providerOrderId} and status <> 'captured' for update`;
    if (!pay) return;
    await tx`update shop.payments set status = 'failed', provider_payment_id = coalesce(${providerPaymentId}, provider_payment_id),
             error_code = ${code}, error_description = ${description?.slice(0, 300) ?? null} where id = ${pay.id}`;
    await tx`update shop.orders set status = 'payment_failed', payment_status = 'failed' where id = ${pay.orderId} and status = 'pending_payment'`;
    await tx`insert into shop.order_events (order_id, status, note, actor) values (${pay.orderId}, 'payment_failed', ${description?.slice(0, 200) ?? "Payment failed"}, 'payment_gateway')`;
  });
}

export type CancelResult = { refund: null | { refundId: string; paymentRowId: string; providerPaymentId: string; amountPaise: number } };

/** Cancels an order, returns stock, and (if paid) creates a pending refund for the caller to submit to the gateway. */
export async function cancelOrder(
  sql: Sql,
  orderId: string,
  opts: { actor: "customer" | "operations" | "system"; reason: string; allowPacked?: boolean },
): Promise<CancelResult> {
  return sql.begin(async (tx) => {
    const [o] = await tx<{ status: OrderStatus; paymentStatus: string; totalPaise: number }[]>`
      select status, payment_status as "paymentStatus", total_paise as "totalPaise" from shop.orders where id = ${orderId} for update`;
    if (!o) throw new CheckoutError("Order not found.");
    const customerCancellable: OrderStatus[] = ["pending_payment", "payment_failed", "confirmed", "processing"];
    if (opts.actor === "customer" && !customerCancellable.includes(o.status)) {
      throw new CheckoutError("This order has already been packed, so it can’t be cancelled. You can request a return after delivery.");
    }
    if (o.status !== "pending_payment" && o.status !== "payment_failed" && !canTransition(o.status, "cancelled")) {
      throw new CheckoutError(`Orders that are ${o.status.replace(/_/g, " ")} can’t be cancelled.`);
    }

    // put the stock back (reserved or committed)
    await tx`
      update shop.product_variants v set stock = v.stock + r.quantity
      from shop.inventory_reservations r
      where r.order_id = ${orderId} and r.variant_id = v.id and r.released_at is null`;
    await tx`update shop.inventory_reservations set released_at = now() where order_id = ${orderId} and released_at is null`;
    if (o.paymentStatus === "paid") {
      await tx`update shop.products p set units_sold = greatest(0, p.units_sold - i.quantity) from shop.order_items i where i.order_id = ${orderId} and i.product_id = p.id`;
    }
    await tx`update shop.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = ${opts.reason.slice(0, 300)},
             payment_status = case when payment_status = 'paid' then 'refund_pending' when payment_status = 'pending' then 'failed' else payment_status end
             where id = ${orderId}`;
    await tx`insert into shop.order_events (order_id, status, note, actor) values (${orderId}, 'cancelled', ${opts.reason.slice(0, 300)}, ${opts.actor})`;

    let refund: CancelResult["refund"] = null;
    if (o.paymentStatus === "paid") {
      const [pay] = await tx<{ id: string; providerPaymentId: string }[]>`
        select id, provider_payment_id as "providerPaymentId" from shop.payments where order_id = ${orderId} and status = 'captured' limit 1`;
      if (pay) {
        const [r] = await tx<{ id: string }[]>`
          insert into shop.refunds (order_id, payment_id, amount_paise, status, reason) values (${orderId}, ${pay.id}, ${o.totalPaise}, 'pending', 'Order cancelled') returning id`;
        refund = { refundId: r!.id, paymentRowId: pay.id, providerPaymentId: pay.providerPaymentId, amountPaise: o.totalPaise };
      }
      await enqueueOrderNotification(tx, orderId, "order_cancelled");
    }
    return { refund };
  });
}

/** Records the gateway's answer for a refund (from the API response or the refund.* webhook). */
export async function applyRefundStatus(sql: Sql, refundId: string, providerRefundId: string, status: "pending" | "processed" | "failed") {
  await sql.begin(async (tx) => {
    const [r] = await tx<{ orderId: string; prev: string }[]>`
      update shop.refunds set provider_refund_id = ${providerRefundId}, status = ${status},
             processed_at = case when ${status} = 'processed' then coalesce(processed_at, now()) else processed_at end
      where id = ${refundId} returning order_id as "orderId", status as prev`;
    if (!r) return;
    if (status === "processed") {
      const [t] = await tx<{ refunded: number; total: number }[]>`
        select coalesce(sum(amount_paise) filter (where status = 'processed'), 0)::int as refunded,
               (select total_paise from shop.orders where id = ${r.orderId}) as total
        from shop.refunds where order_id = ${r.orderId}`;
      await tx`update shop.orders set payment_status = ${t!.refunded >= t!.total ? "refunded" : "partially_refunded"} where id = ${r.orderId}`;
      await enqueueOrderNotification(tx, r.orderId, "refund_processed", { dedupeSuffix: refundId });
    }
  });
}

/** Looks up an order for a guest using its number and the secret token from the confirmation link. */
export async function findOrderForGuest(sql: Sql, orderNumber: string, token: string) {
  if (!/^ZN\d{6,20}$/.test(orderNumber) || token.length < 20 || token.length > 64) return null;
  const [o] = await sql<{ id: string }[]>`
    select id from shop.orders where order_number = ${orderNumber} and guest_access_hash = ${sha256(token)}`;
  return o?.id ?? null;
}

export async function findOrderByContact(sql: Sql, orderNumber: string, email: string, phone: string) {
  const [o] = await sql<{ id: string }[]>`
    select id from shop.orders where order_number = ${orderNumber.trim().toUpperCase()}
      and lower(email) = ${email.trim().toLowerCase()} and phone = ${phone.replace(/\D/g, "").slice(-10)}`;
  return o?.id ?? null;
}

/** Issues a fresh secret link for an order (rotates the previous one). */
export async function rotateGuestToken(sql: Sql, orderId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await sql`update shop.orders set guest_access_hash = ${sha256(token)} where id = ${orderId}`;
  return token;
}

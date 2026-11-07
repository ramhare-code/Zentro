// Order lifecycle with transactional integrity. Server-side only.
// Shared by the storefront (checkout, cancellation), payment webhooks
// and the admin (fulfilment), so every path enforces the same rules.
import { createHash, randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "./db";
import { canTransition, type OrderStatus } from "./order-status";
import { couponDiscount, priceLines } from "./pricing";
import { formatPaise } from "./money";
import { loadStoreSettings, sellerSnapshot } from "./settings";
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
    imageUrl: string | null; hsnCode: string | null; quantity: number; unitPricePaise: number; unitMrpPaise: number; basePricePaise: number; promotionId: string | null;
    discountPaise: number; lineTotalPaise: number; gstRate: number; taxablePaise: number;
    cgstPaise: number; sgstPaise: number; igstPaise: number;
  }[];
  subtotalPaise: number;
  discountPaise: number;
  couponId: string | null;
  couponCode: string | null;
  couponMessage: string | null;
  shippingPaise: number;
  /** GST inside the shipping charge (zero unless shipping GST is switched on in store settings). */
  shippingTax: { gstRate: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
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
    pricePaise: number; basePricePaise: number; promotionId: string | null; categoryId: string; categoryPath: string[];
    mrpPaise: number; stock: number; available: boolean; gstRate: string; hsnCode: string | null; imageUrl: string | null;
  }[]>`
    select v.id as "variantId", p.id as "productId", p.name as "productName", v.options, v.sku,
           vp.price_paise as "pricePaise", vp.base_price_paise as "basePricePaise", vp.promotion_id as "promotionId",
           p.category_id as "categoryId", shop.category_path(p.category_id)::text[] as "categoryPath",
           v.mrp_paise as "mrpPaise", v.stock,
           (v.is_active and shop.product_live(p.is_active, p.publish_at, p.archived_at)) as available, p.gst_rate::text as "gstRate", p.hsn_code as "hsnCode",
           coalesce((select url from shop.product_media m where m.id = v.media_id),
                    (select url from shop.product_media m where m.product_id = p.id and m.kind = 'image' order by sort_order limit 1)) as "imageUrl"
    from shop.product_variants v join shop.products p on p.id = v.product_id join shop.variant_prices vp on vp.variant_id = v.id
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
  let eligible: boolean[] | undefined;
  const code = input.couponCode?.trim().toUpperCase();
  if (code) {
    const [c] = await tx<{
      id: string; code: string; discountType: "percent" | "fixed"; discountValue: number; maxDiscountPaise: number | null;
      minOrderPaise: number; usageLimit: number | null; usedCount: number; perUserLimit: number | null; firstOrderOnly: boolean; live: boolean;
      appliesTo: "all" | "categories" | "products"; categoryIds: string[]; productIds: string[]; combinable: boolean; pending: number;
    }[]>`
      select id, code, discount_type as "discountType", discount_value as "discountValue", max_discount_paise as "maxDiscountPaise",
             min_order_paise as "minOrderPaise", usage_limit as "usageLimit", used_count as "usedCount",
             per_user_limit as "perUserLimit", first_order_only as "firstOrderOnly",
             applies_to as "appliesTo", category_ids::text[] as "categoryIds", product_ids::text[] as "productIds", combinable,
             -- unpaid checkouts still holding stock also hold a use, so a limited coupon can't be over-redeemed
             (select count(*)::int from shop.orders o where o.coupon_id = coupons.id and o.status in ('pending_payment','payment_failed') and o.reservation_expires_at > now()) as pending,
             (is_active and archived_at is null and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) as live
      from shop.coupons where code = ${code}
      ${lock ? tx`for update` : tx``}`;
    const paidBefore = c
      ? await tx<{ total: number; withCoupon: number }[]>`
          select count(*)::int as total, count(*) filter (where coupon_id = ${c.id})::int as "withCoupon"
          from shop.orders where payment_status in ('paid','partially_refunded','refunded','refund_pending') and status <> 'cancelled'
            and (lower(email) = ${input.email.toLowerCase()} or (${input.userId ?? null}::uuid is not null and user_id = ${input.userId ?? null}))`
      : [];
    const used = paidBefore[0];
    const inScope = rows.map((r) => !!c && (
      c.appliesTo === "all" || (c.appliesTo === "products" && c.productIds.includes(r.productId))
      || (c.appliesTo === "categories" && r.categoryPath.some((id) => c.categoryIds.includes(id)))));
    eligible = rows.map((r, i) => inScope[i]! && (c!.combinable || r.promotionId === null));
    const eligibleSubtotal = rows.reduce((a, r, i) => a + (eligible![i] ? r.pricePaise * qty.get(r.variantId)! : 0), 0);
    if (!c || !c.live) couponMessage = "This coupon code isn’t valid.";
    else if (c.usageLimit !== null && c.usedCount + c.pending >= c.usageLimit) couponMessage = "This coupon has been fully redeemed.";
    else if (c.perUserLimit !== null && used && used.withCoupon >= c.perUserLimit) couponMessage = "You’ve already used this coupon.";
    else if (c.firstOrderOnly && used && used.total > 0) couponMessage = "This coupon is for first orders only.";
    else if (!inScope.some(Boolean)) couponMessage = "This coupon doesn’t apply to the items in your cart.";
    else if (eligibleSubtotal === 0) couponMessage = "This coupon can’t be combined with items already on sale.";
    else if (eligibleSubtotal < c.minOrderPaise) couponMessage = `Add eligible items worth ₹${Math.ceil((c.minOrderPaise - eligibleSubtotal) / 100)} more to use this coupon.`;
    else {
      discount = couponDiscount(eligibleSubtotal, c);
      couponId = c.id;
      couponCode = c.code;
      couponMessage = `${c.code} applied.`;
    }
    if (!couponId) eligible = undefined;
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
    eligible,
  );
  const lines = priced.map((p, i) => {
    const r = rows[i]!;
    const label = Object.values(r.options).join(" / ");
    return {
      variantId: r.variantId, productId: r.productId, productName: r.productName, variantLabel: label || null, sku: r.sku,
      imageUrl: r.imageUrl, hsnCode: r.hsnCode, quantity: p.quantity, unitPricePaise: r.pricePaise, unitMrpPaise: r.mrpPaise,
      basePricePaise: r.basePricePaise, promotionId: r.promotionId,
      discountPaise: p.discountPaise, lineTotalPaise: p.lineTotalPaise, gstRate: p.gstRate, taxablePaise: p.taxablePaise,
      cgstPaise: p.cgstPaise, sgstPaise: p.sgstPaise, igstPaise: p.igstPaise,
    };
  });
  // Shipping charged with goods is a composite supply: taxed at the principal (highest) item rate when enabled.
  const shippingTax = { gstRate: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
  if (rate.feePaise > 0 && (await loadStoreSettings(tx)).shippingGstMode === "highest_item_rate") {
    const r = Math.max(...lines.map((l) => l.gstRate));
    const taxable = Math.round((rate.feePaise * 100) / (100 + r));
    const t = rate.feePaise - taxable;
    Object.assign(shippingTax, { gstRate: r, taxablePaise: taxable, cgstPaise: intra ? Math.floor(t / 2) : 0, sgstPaise: intra ? t - Math.floor(t / 2) : 0, igstPaise: intra ? 0 : t });
  }
  const tax = lines.reduce((a, l) => a + l.cgstPaise + l.sgstPaise + l.igstPaise, 0) + shippingTax.cgstPaise + shippingTax.sgstPaise + shippingTax.igstPaise;
  return {
    shippingTax,
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
        reservation_expires_at, whatsapp_updates,
        shipping_gst_rate, shipping_taxable_paise, shipping_cgst_paise, shipping_sgst_paise, shipping_igst_paise)
      values (
        ${orderNumber}, ${input.userId ?? null}, ${input.email.toLowerCase()}, ${input.phone}, ${sha256(guestToken)},
        'pending_payment', 'pending', ${q.subtotalPaise}, ${q.discountPaise}, ${q.shippingPaise}, ${q.taxPaise}, ${q.totalPaise},
        ${q.couponId}, ${q.couponCode}, ${tx.json(input.address as never)}, ${input.address.stateCode},
        ${addDays(q.estDaysMin)}, ${addDays(q.estDaysMax)}, ${input.idempotencyKey},
        now() + make_interval(mins => ${RESERVATION_MINUTES}), ${input.whatsappUpdates},
        ${q.shippingTax.gstRate}, ${q.shippingTax.taxablePaise}, ${q.shippingTax.cgstPaise}, ${q.shippingTax.sgstPaise}, ${q.shippingTax.igstPaise})
      returning id`;
    const orderId = o!.id;

    for (const l of q.lines) {
      await tx`
        insert into shop.order_items (order_id, product_id, variant_id, product_name, variant_label, sku, image_url, hsn_code,
          quantity, unit_price_paise, unit_mrp_paise, discount_paise, line_total_paise, gst_rate, taxable_paise, cgst_paise, sgst_paise, igst_paise, unit_cost_paise, base_price_paise, promotion_id)
        values (${orderId}, ${l.productId}, ${l.variantId}, ${l.productName}, ${l.variantLabel}, ${l.sku}, ${l.imageUrl}, ${l.hsnCode},
          ${l.quantity}, ${l.unitPricePaise}, ${l.unitMrpPaise}, ${l.discountPaise}, ${l.lineTotalPaise}, ${l.gstRate}, ${l.taxablePaise},
          ${l.cgstPaise}, ${l.sgstPaise}, ${l.igstPaise}, (select cost_paise from shop.product_variants where id = ${l.variantId}), ${l.basePricePaise}, ${l.promotionId})`;
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
    // the seller's details are frozen on the invoice, so later edits never change an issued invoice
    const seller = sellerSnapshot(await loadStoreSettings(tx));
    await tx`insert into shop.invoices (order_id, invoice_number, seller)
             values (${row.orderId}, ${"ZN/" + fy + "/"} || lpad(nextval('shop.invoice_number_seq')::text, 6, '0'), ${tx.json(seller as never)})
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
      // a cancelled order gives its coupon use back
      await tx`update shop.coupons c set used_count = greatest(0, c.used_count - 1) from shop.orders o where o.id = ${orderId} and o.coupon_id = c.id`;
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
      // a refunded duplicate payment returns extra money; the order itself stays paid
      const [t] = await tx<{ refunded: number; total: number; duplicate: boolean }[]>`
        select coalesce(sum(amount_paise) filter (where status = 'processed' and reason is distinct from 'Duplicate payment'), 0)::int as refunded,
               (select total_paise from shop.orders where id = ${r.orderId}) as total,
               bool_or(id = ${refundId} and reason = 'Duplicate payment') as duplicate
        from shop.refunds where order_id = ${r.orderId}`;
      if (!t!.duplicate) await tx`update shop.orders set payment_status = ${t!.refunded >= t!.total ? "refunded" : "partially_refunded"} where id = ${r.orderId}`;
      await tx`update shop.return_requests set status = 'refunded' where refund_id = ${refundId} and status = 'received'`;
      await issueCreditNote(tx, refundId);
      await enqueueOrderNotification(tx, r.orderId, "refund_processed", { dedupeSuffix: refundId });
    }
  });
}

/** Indian financial year label for a date, e.g. 2026-27 (April–March, IST). */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear(), start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Splits a credit across lines in proportion, keeping the integer total exact. */
export function prorate(values: number[], target: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return values.map(() => 0);
  const out = values.map((v) => Math.floor((v * target) / sum));
  let rest = target - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % out.length) if (values[i]! > 0) { out[i]!++; rest--; }
  return out;
}

/**
 * Issues a GST credit note for a processed refund that reverses a supply
 * (returned items, or cancellation of an invoiced order). Idempotent per refund.
 */
export async function issueCreditNote(tx: TransactionSql, refundId: string) {
  const [r] = await tx<{ orderId: string; returnId: string | null; reason: string | null; amount: number; invoiceId: string | null }[]>`
    select r.order_id as "orderId", r.return_request_id as "returnId", r.reason, r.amount_paise as amount,
           (select id from shop.invoices i where i.order_id = r.order_id) as "invoiceId"
    from shop.refunds r where r.id = ${refundId} and r.status = 'processed'`;
  if (!r?.invoiceId) return null;                       // nothing invoiced → nothing to reverse
  if (r.reason === "Duplicate payment") return null;    // money returned, but no supply was reversed
  const [exists] = await tx`select 1 from shop.credit_notes where refund_id = ${refundId}`;
  if (exists) return null;
  type L = { orderItemId: string; hsn: string | null; gstRate: string; quantity: number; taxable: number; cgst: number; sgst: number; igst: number };
  const lines = r.returnId
    ? await tx<L[]>`
        select i.id as "orderItemId", i.hsn_code as hsn, i.gst_rate::text as "gstRate", ri.quantity,
               round(i.taxable_paise::numeric * ri.quantity / i.quantity)::int as taxable, round(i.cgst_paise::numeric * ri.quantity / i.quantity)::int as cgst,
               round(i.sgst_paise::numeric * ri.quantity / i.quantity)::int as sgst, round(i.igst_paise::numeric * ri.quantity / i.quantity)::int as igst
        from shop.return_items ri join shop.order_items i on i.id = ri.order_item_id where ri.return_id = ${r.returnId} order by i.id`
    : await tx<L[]>`
        select i.id as "orderItemId", i.hsn_code as hsn, i.gst_rate::text as "gstRate", i.quantity - i.returned_quantity as quantity,
               round(i.taxable_paise::numeric * (i.quantity - i.returned_quantity) / i.quantity)::int as taxable,
               round(i.cgst_paise::numeric * (i.quantity - i.returned_quantity) / i.quantity)::int as cgst,
               round(i.sgst_paise::numeric * (i.quantity - i.returned_quantity) / i.quantity)::int as sgst,
               round(i.igst_paise::numeric * (i.quantity - i.returned_quantity) / i.quantity)::int as igst
        from shop.order_items i where i.order_id = ${r.orderId} and i.quantity > i.returned_quantity order by i.id`;
  // a full cancellation also refunds the shipping charge: reverse its GST too
  if (!r.returnId) {
    const [sh] = await tx<{ fee: number; rate: string; taxable: number; cgst: number; sgst: number; igst: number }[]>`
      select shipping_paise as fee, shipping_gst_rate::text as rate, shipping_taxable_paise as taxable, shipping_cgst_paise as cgst, shipping_sgst_paise as sgst, shipping_igst_paise as igst
      from shop.orders where id = ${r.orderId}`;
    const already = await tx`select 1 from shop.credit_notes c, jsonb_array_elements(c.lines) l where c.order_id = ${r.orderId} and l->>'hsn' = 'SHIPPING'`;
    if (sh && sh.taxable > 0 && !already.length) lines.push({ orderItemId: null as never, hsn: "SHIPPING", gstRate: sh.rate, quantity: 0, taxable: sh.taxable, cgst: sh.cgst, sgst: sh.sgst, igst: sh.igst });
  }
  let goods = lines.reduce((a, l) => a + l.taxable + l.cgst + l.sgst + l.igst, 0);
  if (goods > r.amount) {
    // partial refund: scale every component so the note equals what was refunded
    const flat = lines.flatMap((l) => [l.taxable, l.cgst, l.sgst, l.igst]);
    const scaled = prorate(flat, r.amount);
    lines.forEach((l, i) => { [l.taxable, l.cgst, l.sgst, l.igst] = scaled.slice(i * 4, i * 4 + 4) as [number, number, number, number]; });
    goods = r.amount;
  }
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst") => lines.reduce((a, l) => a + l[k], 0);
  const [n] = await tx<{ n: string }[]>`select lpad(nextval('shop.credit_note_seq')::text, 6, '0') as n`;
  const number = `ZN/CN/${financialYear(new Date())}/${n!.n}`;
  await tx`
    insert into shop.credit_notes (credit_note_number, order_id, invoice_id, refund_id, reason, taxable_paise, cgst_paise, sgst_paise, igst_paise, other_paise, total_paise, lines)
    values (${number}, ${r.orderId}, ${r.invoiceId}, ${refundId}, ${r.returnId ? "Goods returned" : r.reason ?? "Order cancelled"},
            ${sum("taxable")}, ${sum("cgst")}, ${sum("sgst")}, ${sum("igst")}, ${r.amount - goods}, ${r.amount}, ${tx.json(lines as never)})`;
  return number;
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

// ---------------------------------------------------------------------
// Fulfilment (operations)
// ---------------------------------------------------------------------

const NOTIFY_ON: Partial<Record<OrderStatus, string>> = {
  shipped: "order_shipped",
  out_for_delivery: "order_out_for_delivery",
  delivered: "order_delivered",
};

/**
 * Moves an order forward along the allowed lifecycle. Shipping requires a
 * carrier; customers are notified on shipped / out for delivery / delivered.
 */
export async function advanceOrder(
  sql: Sql,
  orderId: string,
  to: OrderStatus,
  opts: { actor: "operations" | "carrier" | "system"; note?: string; shipment?: { carrier: string; trackingNumber?: string; trackingUrl?: string } },
): Promise<void> {
  await sql.begin(async (tx) => {
    const [o] = await tx<{ status: OrderStatus; paymentStatus: string }[]>`
      select status, payment_status as "paymentStatus" from shop.orders where id = ${orderId} for update`;
    if (!o) throw new CheckoutError("Order not found.");
    if (to === "cancelled") throw new CheckoutError("Use cancel to cancel an order.");
    if (!canTransition(o.status, to)) throw new CheckoutError(`An order that is ${o.status.replace(/_/g, " ")} can’t move to ${to.replace(/_/g, " ")}.`);
    if (o.paymentStatus !== "paid" && ["processing", "packed", "shipped"].includes(to)) throw new CheckoutError("Only paid orders can be fulfilled.");

    if (to === "shipped") {
      const s = opts.shipment;
      if (!s?.carrier?.trim()) throw new CheckoutError("Enter the carrier to mark the order shipped.");
      if (s.trackingUrl && !/^https:\/\//.test(s.trackingUrl)) throw new CheckoutError("Tracking link must start with https://");
      await tx`insert into shop.shipments (order_id, carrier, tracking_number, tracking_url, status, shipped_at)
               values (${orderId}, ${s.carrier.trim().slice(0, 80)}, ${s.trackingNumber?.trim().slice(0, 60) || null}, ${s.trackingUrl?.trim().slice(0, 300) || null}, 'in_transit', now())`;
    }
    if (to === "out_for_delivery") await tx`update shop.shipments set status = 'out_for_delivery' where order_id = ${orderId} and delivered_at is null`;
    if (to === "delivered") await tx`update shop.shipments set status = 'delivered', delivered_at = now() where order_id = ${orderId} and delivered_at is null`;

    await tx`update shop.orders set status = ${to}, delivered_at = case when ${to} = 'delivered' then now() else delivered_at end where id = ${orderId}`;
    await tx`insert into shop.order_events (order_id, status, note, actor) values (${orderId}, ${to}, ${opts.note?.slice(0, 300) ?? null}, ${opts.actor})`;
    const template = NOTIFY_ON[to];
    if (template) await enqueueOrderNotification(tx, orderId, template);
  });
}

// ---------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------

export const RETURN_REASONS = {
  damaged: "Arrived damaged", defective: "Doesn’t work / defective", wrong_item: "Wrong item sent",
  not_as_described: "Not as described", size_fit: "Size or fit issue", changed_mind: "Changed my mind", other: "Other",
} as const;
export type ReturnReason = keyof typeof RETURN_REASONS;

export const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: "Requested", approved: "Approved", rejected: "Not approved", pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up", received: "Received — refund in progress", refunded: "Refunded", cancelled: "Cancelled",
};

async function notifyReturn(tx: TransactionSql, orderId: string, returnId: string, status: string, message = "") {
  await enqueueOrderNotification(tx, orderId, "return_update", { dedupeSuffix: `${returnId}:${status}`, status: RETURN_STATUS_LABELS[status] ?? status, message });
}

/** Items still eligible for return on an order (delivered quantity minus returned/open requests). */
export async function returnableItems(sql: Sql | TransactionSql, orderId: string) {
  return sql<{ id: string; productName: string; variantLabel: string | null; quantity: number; available: number }[]>`
    select i.id, i.product_name as "productName", i.variant_label as "variantLabel", i.quantity,
           (i.quantity - i.returned_quantity - coalesce((
             select sum(ri.quantity) from shop.return_items ri join shop.return_requests rr on rr.id = ri.return_id
             where ri.order_item_id = i.id and rr.status in ('requested','approved','pickup_scheduled','picked_up')), 0))::int as available
    from shop.order_items i where i.order_id = ${orderId} order by i.product_name`;
}

export async function requestReturn(
  sql: Sql, orderId: string,
  input: { items: { orderItemId: string; quantity: number }[]; reason: ReturnReason; details?: string; windowDays: number; userId?: string | null },
): Promise<string> {
  return sql.begin(async (tx) => {
    const [o] = await tx<{ status: OrderStatus; deliveredAt: Date | null; userId: string | null }[]>`
      select status, delivered_at as "deliveredAt", user_id as "userId" from shop.orders where id = ${orderId} for update`;
    if (!o) throw new CheckoutError("Order not found.");
    if (o.status !== "delivered" && o.status !== "return_requested") throw new CheckoutError("Returns can be requested after delivery.");
    if (!o.deliveredAt || Date.now() - o.deliveredAt.getTime() > input.windowDays * 86_400_000) {
      throw new CheckoutError(`The ${input.windowDays}-day return window for this order has closed.`);
    }
    if (!(input.reason in RETURN_REASONS)) throw new CheckoutError("Choose a reason.");
    const chosen = input.items.filter((i) => i.quantity > 0);
    if (!chosen.length) throw new CheckoutError("Choose at least one item to return.");
    const avail = await returnableItems(tx, orderId);
    for (const c of chosen) {
      const a = avail.find((x) => x.id === c.orderItemId);
      if (!a || c.quantity > a.available) throw new CheckoutError(`You can return at most ${a?.available ?? 0} of ${a?.productName ?? "that item"}.`);
    }
    const [r] = await tx<{ id: string }[]>`
      insert into shop.return_requests (order_id, user_id, reason, details) values (${orderId}, ${input.userId ?? o.userId}, ${input.reason}, ${input.details?.slice(0, 2000) || null}) returning id`;
    for (const c of chosen) await tx`insert into shop.return_items (return_id, order_item_id, quantity) values (${r!.id}, ${c.orderItemId}, ${c.quantity})`;
    if (o.status === "delivered") {
      await tx`update shop.orders set status = 'return_requested' where id = ${orderId}`;
      await tx`insert into shop.order_events (order_id, status, note, actor) values (${orderId}, 'return_requested', ${RETURN_REASONS[input.reason]}, 'customer')`;
    }
    await notifyReturn(tx, orderId, r!.id, "requested", "We’ll review your request and get back to you shortly.");
    return r!.id;
  });
}

/** Staff decisions before the items are back. */
export async function updateReturn(sql: Sql, returnId: string, to: "approved" | "rejected" | "pickup_scheduled" | "picked_up", note?: string) {
  const allowed: Record<string, string[]> = { requested: ["approved", "rejected"], approved: ["pickup_scheduled", "picked_up", "rejected"], pickup_scheduled: ["picked_up"], picked_up: [] };
  await sql.begin(async (tx) => {
    const [r] = await tx<{ orderId: string; status: string }[]>`select order_id as "orderId", status from shop.return_requests where id = ${returnId} for update`;
    if (!r) throw new CheckoutError("Return not found.");
    if (!allowed[r.status]?.includes(to)) throw new CheckoutError(`A return that is ${r.status.replace(/_/g, " ")} can’t become ${to.replace(/_/g, " ")}.`);
    await tx`update shop.return_requests set status = ${to}, resolution_note = coalesce(${note?.slice(0, 500) || null}, resolution_note) where id = ${returnId}`;
    if (to === "rejected") {
      const [open] = await tx`select 1 from shop.return_requests where order_id = ${r.orderId} and id <> ${returnId} and status in ('requested','approved','pickup_scheduled','picked_up')`;
      if (!open) await tx`update shop.orders set status = 'delivered' where id = ${r.orderId} and status = 'return_requested'`;
    }
    await tx`insert into shop.order_events (order_id, status, note, actor) values (${r.orderId}, ${"return_" + to}, ${note?.slice(0, 300) ?? null}, 'operations')`;
    await notifyReturn(tx, r.orderId, returnId, to, note ?? "");
  });
}

/**
 * Items are back: restock, record returned quantities and create a refund
 * for exactly those items (GST-inclusive line value, pro-rata incl. any
 * coupon discount). Returns the refund to submit to the gateway.
 */
export async function receiveReturn(sql: Sql, returnId: string): Promise<{ refundId: string; providerPaymentId: string; amountPaise: number; orderId: string } | null> {
  return sql.begin(async (tx) => {
    const [r] = await tx<{ orderId: string; status: string }[]>`select order_id as "orderId", status from shop.return_requests where id = ${returnId} for update`;
    if (!r) throw new CheckoutError("Return not found.");
    if (!["approved", "pickup_scheduled", "picked_up"].includes(r.status)) throw new CheckoutError("Approve the return before receiving it.");
    const items = await tx<{ orderItemId: string; variantId: string | null; productId: string | null; qty: number; lineTotal: number; quantity: number }[]>`
      select ri.order_item_id as "orderItemId", i.variant_id as "variantId", i.product_id as "productId", ri.quantity as qty,
             i.line_total_paise as "lineTotal", i.quantity
      from shop.return_items ri join shop.order_items i on i.id = ri.order_item_id where ri.return_id = ${returnId} for update of i`;
    let amount = 0;
    for (const it of items) {
      amount += Math.round((it.lineTotal * it.qty) / it.quantity);
      await tx`update shop.order_items set returned_quantity = returned_quantity + ${it.qty} where id = ${it.orderItemId}`;
      if (it.variantId) await tx`update shop.product_variants set stock = stock + ${it.qty} where id = ${it.variantId}`;
      if (it.productId) await tx`update shop.products set units_sold = greatest(0, units_sold - ${it.qty}) where id = ${it.productId}`;
    }
    const [pay] = await tx<{ id: string; providerPaymentId: string }[]>`
      select id, provider_payment_id as "providerPaymentId" from shop.payments where order_id = ${r.orderId} and status = 'captured' limit 1`;
    const [left] = await tx<{ n: number }[]>`select coalesce(sum(quantity - returned_quantity), 0)::int as n from shop.order_items where order_id = ${r.orderId}`;
    const [open] = await tx`select 1 from shop.return_requests where order_id = ${r.orderId} and id <> ${returnId} and status in ('requested','approved','pickup_scheduled','picked_up')`;
    await tx`update shop.orders set status = ${left!.n === 0 ? "returned" : open ? "return_requested" : "delivered"} where id = ${r.orderId}`;
    let refund = null;
    if (pay && amount > 0) {
      const [rf] = await tx<{ id: string }[]>`
        insert into shop.refunds (order_id, payment_id, return_request_id, amount_paise, reason) values (${r.orderId}, ${pay.id}, ${returnId}, ${amount}, 'Return received') returning id`;
      await tx`update shop.return_requests set status = 'received', refund_id = ${rf!.id} where id = ${returnId}`;
      await tx`update shop.orders set payment_status = 'refund_pending' where id = ${r.orderId}`;
      refund = { refundId: rf!.id, providerPaymentId: pay.providerPaymentId, amountPaise: amount, orderId: r.orderId };
    } else {
      await tx`update shop.return_requests set status = 'received' where id = ${returnId}`;
    }
    await tx`insert into shop.order_events (order_id, status, note, actor) values (${r.orderId}, 'return_received', ${`Items received; refund of ${formatPaise(amount)}`}, 'operations')`;
    await notifyReturn(tx, r.orderId, returnId, "received", `We’ve received your items. A refund of ${formatPaise(amount)} has been started to your original payment method.`);
    return refund;
  });
}

"use server";

import { getSettings } from "../settings";
import { headers } from "next/headers";
import { z } from "zod";
import { STATE_CODES } from "@zentro/commerce";
import {
  applyRefundStatus, cancelOrder, CheckoutError, confirmPaidOrder, findOrderByContact, findOrderForGuest,
  placeOrder, quote, recordPaymentFailure, rotateGuestToken, type Quote,
} from "@zentro/commerce/orders";
import { razorpay, razorpayConfigFromEnv, verifyPaymentSignature } from "@zentro/commerce/razorpay";
import { getCartId, getCartLines, linesForVariant, syncCartCount } from "../cart";
import { db } from "../db";
import { serverEnv } from "../env";
import { SITE_NAME } from "../site";
import { getCustomer } from "../customer";

const phone = z.string().transform((v) => v.replace(/\D/g, "").slice(-10)).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number."));
const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, msg);

const addressSchema = z.object({
  fullName: text(2, 100, "Enter the recipient’s full name."),
  phone,
  line1: text(3, 200, "Enter the house / flat and street."),
  line2: z.string().trim().max(200).optional().transform((v) => v || undefined),
  landmark: z.string().trim().max(100).optional().transform((v) => v || undefined),
  city: text(2, 80, "Enter the city."),
  stateCode: z.string().refine((s) => STATE_CODES.includes(s), "Choose a state."),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode."),
});

const checkoutSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  address: addressSchema,
  couponCode: z.string().trim().toUpperCase().max(20).optional().transform((v) => v || undefined),
  idempotencyKey: z.guid(),
  buy: z.object({ variantId: z.guid(), quantity: z.number().int().min(1).max(10) }).optional(),
  consent: z.object({ sms: z.boolean(), whatsapp: z.boolean(), email: z.boolean(), whatsappUpdates: z.boolean() }),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

async function linesFor(buy: CheckoutInput["buy"]) {
  const lines = buy ? await linesForVariant(buy.variantId, buy.quantity) : await getCartLines(await getCartId(false));
  return lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
}

async function sellerState(): Promise<string> {
  const s = (await getSettings()).stateCode;
  if (!s) throw new CheckoutError("The store isn’t set up to take orders yet (missing seller state for GST).");
  return s;
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: string };

/** Live price preview for the checkout summary (no stock is reserved). */
export async function previewQuoteAction(p: { stateCode: string; pincode: string; couponCode?: string; email?: string; buy?: CheckoutInput["buy"] }): Promise<QuoteResult> {
  try {
    if (!STATE_CODES.includes(p.stateCode) || !/^[1-9]\d{5}$/.test(p.pincode)) return { ok: false, error: "" };
    const q = await quote(db(), {
      lines: await linesFor(p.buy), couponCode: p.couponCode?.trim().toUpperCase() || undefined, email: p.email ?? "",
      userId: null, sellerStateCode: await sellerState(), stateCode: p.stateCode, pincode: p.pincode,
    });
    return { ok: true, quote: q };
  } catch (e) {
    if (e instanceof CheckoutError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "We couldn’t calculate your total. Please try again." };
  }
}

export type PlaceResult =
  | { ok: true; orderNumber: string; token: string; razorpay: { keyId: string; orderId: string; amount: number; name: string; prefill: { name: string; email: string; contact: string } } }
  | { ok: false; error: string; field?: string };

async function recordConsent(email: string, mobile: string, c: CheckoutInput["consent"]) {
  const h = await headers();
  const evidence = db().json({ ua: h.get("user-agent")?.slice(0, 200) ?? null, form: "checkout-v1" } as never);
  const grants: [string, string, string][] = [];
  if (c.sms) grants.push(["sms", mobile, "Send me offers and new arrivals by SMS."]);
  if (c.whatsapp) grants.push(["whatsapp", mobile, "Send me offers and new arrivals on WhatsApp."]);
  if (c.email) grants.push(["email", email, "Send me offers and new arrivals by email."]);
  const userId = (await getCustomer())?.id ?? null;
  for (const [channel, recipient, wording] of grants) {
    await db()`insert into shop.marketing_consents (channel, recipient, user_id, status, source, wording, evidence)
               values (${channel}, ${recipient}, ${userId}, 'granted', 'checkout', ${wording}, ${evidence})`;
  }
}

export async function placeOrderAction(raw: CheckoutInput): Promise<PlaceResult> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, error: issue.message, field: issue.path.join(".") };
  }
  const input = parsed.data;
  const cfg = razorpayConfigFromEnv();
  if (!cfg) return { ok: false, error: "Online payment isn’t configured yet, so orders can’t be placed. (Store owner: add Razorpay keys.)" };

  const sql = db();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const [rl] = await sql<{ ok: boolean }[]>`select shop.rate_limit_hit(${"checkout:" + ip}, 20, 600) as ok`;
  if (!rl?.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  try {
    const placed = await placeOrder(sql, {
      lines: await linesFor(input.buy), email: input.email, phone: input.address.phone, address: input.address,
      couponCode: input.couponCode, idempotencyKey: input.idempotencyKey, userId: (await getCustomer())?.id ?? null,
      whatsappUpdates: input.consent.whatsappUpdates, sellerStateCode: await sellerState(),
    });
    if (!placed.existing) await recordConsent(input.email, input.address.phone, input.consent);

    // reuse an open gateway order for retries; otherwise create one
    const [open] = await sql<{ providerOrderId: string }[]>`
      select provider_order_id as "providerOrderId" from shop.payments where order_id = ${placed.orderId} and status = 'created' order by created_at desc limit 1`;
    let rzpOrderId = open?.providerOrderId;
    if (!rzpOrderId) {
      try {
        const rzp = await razorpay.createOrder(cfg, placed.totalPaise, placed.orderNumber, { order_number: placed.orderNumber });
        await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${placed.orderId}, ${rzp.id}, ${placed.totalPaise})`;
        rzpOrderId = rzp.id;
      } catch (e) {
        console.error(e);
        await cancelOrder(sql, placed.orderId, { actor: "system", reason: "Payment gateway unavailable" });
        return { ok: false, error: "The payment service didn’t respond. Nothing was charged — please try again." };
      }
    }
    return {
      ok: true, orderNumber: placed.orderNumber, token: placed.guestToken,
      razorpay: { keyId: cfg.keyId, orderId: rzpOrderId, amount: placed.totalPaise, name: SITE_NAME, prefill: { name: input.address.fullName, email: input.email, contact: input.address.phone } },
    };
  } catch (e) {
    if (e instanceof CheckoutError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong while placing your order. You have not been charged." };
  }
}

export type VerifyResult = { ok: true; url: string } | { ok: false; error: string };

/** Called by the browser after Razorpay Checkout returns. Trusts nothing from the browser except IDs. */
export async function verifyPaymentAction(p: { orderNumber: string; token: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string; fromCart: boolean }): Promise<VerifyResult> {
  const cfg = razorpayConfigFromEnv();
  if (!cfg) return { ok: false, error: "Payment isn’t configured." };
  const sql = db();
  const orderId = await findOrderForGuest(sql, p.orderNumber, p.token);
  if (!orderId) return { ok: false, error: "Order not found." };
  const [pay] = await sql`select 1 from shop.payments where order_id = ${orderId} and provider_order_id = ${p.razorpayOrderId}`;
  if (!pay || !verifyPaymentSignature(cfg, p.razorpayOrderId, p.razorpayPaymentId, p.razorpaySignature)) {
    return { ok: false, error: "We couldn’t verify this payment. If money was debited it will be reversed automatically; contact support with your order number." };
  }
  try {
    let payment = await razorpay.fetchPayment(cfg, p.razorpayPaymentId);
    if (payment.order_id !== p.razorpayOrderId) return { ok: false, error: "Payment does not belong to this order." };
    if (payment.status === "authorized") {
      try { payment = await razorpay.capture(cfg, payment.id, payment.amount); } catch { payment = await razorpay.fetchPayment(cfg, payment.id); }
    }
    const result = await confirmPaidOrder(sql, { providerOrderId: p.razorpayOrderId, providerPaymentId: payment.id, amountPaise: payment.amount, currency: payment.currency, status: payment.status, method: payment.method });
    if (result.kind === "rejected") return { ok: false, error: "Your payment hasn’t completed yet. We’ll confirm your order automatically as soon as it does." };
    if (result.kind === "needs_refund") await refundNow(result.orderId, result.paymentRowId, result.providerPaymentId, result.amountPaise, "Stock unavailable after payment");
    if (p.fromCart) {
      const cartId = await getCartId(false);
      if (cartId) {
        await sql`delete from shop.cart_items where cart_id = ${cartId}`;
        await syncCartCount(cartId);
      }
    }
    return { ok: true, url: `/order/${p.orderNumber}?t=${encodeURIComponent(p.token)}&placed=1` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "We couldn’t confirm the payment right now. If it went through, your order will be confirmed automatically." };
  }
}

export async function paymentFailedAction(p: { orderNumber: string; token: string; razorpayOrderId: string; razorpayPaymentId?: string; code?: string; description?: string }) {
  const orderId = await findOrderForGuest(db(), p.orderNumber, p.token);
  if (!orderId) return;
  await recordPaymentFailure(db(), p.razorpayOrderId, p.razorpayPaymentId ?? null, p.code?.slice(0, 60) ?? null, p.description?.slice(0, 300) ?? null);
}

/** Opens a new payment attempt for an unpaid order while its stock is still reserved. */
export async function retryPaymentAction(p: { orderNumber: string; token: string }): Promise<PlaceResult> {
  const cfg = razorpayConfigFromEnv();
  if (!cfg) return { ok: false, error: "Payment isn’t configured." };
  const sql = db();
  const orderId = await findOrderForGuest(sql, p.orderNumber, p.token);
  if (!orderId) return { ok: false, error: "Order not found." };
  const [o] = await sql<{ total: number; email: string; phone: string; name: string; open: boolean }[]>`
    select total_paise as total, email, phone, shipping_address->>'fullName' as name,
           (status in ('pending_payment','payment_failed') and reservation_expires_at > now()) as open
    from shop.orders where id = ${orderId}`;
  if (!o?.open) return { ok: false, error: "This order can no longer be paid. Please place a new order." };
  const rzp = await razorpay.createOrder(cfg, o.total, p.orderNumber, { order_number: p.orderNumber, retry: "1" });
  await sql.begin(async (tx) => {
    await tx`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${orderId}, ${rzp.id}, ${o.total})`;
    await tx`update shop.orders set status = 'pending_payment', payment_status = 'pending' where id = ${orderId} and status = 'payment_failed'`;
  });
  return { ok: true, orderNumber: p.orderNumber, token: p.token, razorpay: { keyId: cfg.keyId, orderId: rzp.id, amount: o.total, name: SITE_NAME, prefill: { name: o.name, email: o.email, contact: o.phone } } };
}

async function refundNow(orderId: string, paymentRowId: string, providerPaymentId: string, amountPaise: number, reason: string, refundRowId?: string) {
  const cfg = razorpayConfigFromEnv()!;
  const sql = db();
  let refundId = refundRowId;
  if (!refundId) {
    const [r] = await sql<{ id: string }[]>`insert into shop.refunds (order_id, payment_id, amount_paise, reason) values (${orderId}, ${paymentRowId}, ${amountPaise}, ${reason}) returning id`;
    refundId = r!.id;
  }
  try {
    const rf = await razorpay.refund(cfg, providerPaymentId, amountPaise, { order_id: orderId, reason }, refundId.slice(0, 40));
    await applyRefundStatus(sql, refundId, rf.id, rf.status);
  } catch (e) {
    // stays 'pending' with no provider id; shown in admin for follow-up
    console.error("refund submission failed", e);
  }
}

export type CancelOrderResult = { ok: boolean; message: string };

export async function cancelOrderAction(p: { orderNumber: string; token: string; reason: string }): Promise<CancelOrderResult> {
  const sql = db();
  const orderId = await findOrderForGuest(sql, p.orderNumber, p.token);
  if (!orderId) return { ok: false, message: "Order not found." };
  try {
    const r = await cancelOrder(sql, orderId, { actor: "customer", reason: `Cancelled by customer: ${p.reason.slice(0, 200) || "no reason given"}` });
    if (r.refund) {
      await refundNow(orderId, r.refund.paymentRowId, r.refund.providerPaymentId, r.refund.amountPaise, "Order cancelled", r.refund.refundId);
      return { ok: true, message: "Your order is cancelled. A full refund has been requested to your original payment method." };
    }
    return { ok: true, message: "Your order is cancelled." };
  } catch (e) {
    if (e instanceof CheckoutError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "We couldn’t cancel the order. Please contact support." };
  }
}

export type LookupResult = { ok: false; error: string } | { ok: true; url: string };

export async function lookupOrderAction(_: LookupResult | undefined, form: FormData): Promise<LookupResult> {
  const orderNumber = String(form.get("orderNumber") ?? "").trim().toUpperCase().slice(0, 30);
  const email = String(form.get("email") ?? "").slice(0, 200);
  const mobile = String(form.get("phone") ?? "").slice(0, 20);
  const sql = db();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const [rl] = await sql<{ ok: boolean }[]>`select shop.rate_limit_hit(${"lookup:" + ip}, 10, 900) as ok`;
  if (!rl?.ok) return { ok: false, error: "Too many attempts. Please wait 15 minutes." };
  const orderId = await findOrderByContact(sql, orderNumber, email, mobile);
  if (!orderId) return { ok: false, error: "We couldn’t find an order with those details." };
  const token = await rotateGuestToken(sql, orderId);
  return { ok: true, url: `/order/${orderNumber}?t=${encodeURIComponent(token)}` };
}

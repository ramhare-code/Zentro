// Razorpay REST client (server-side only). Docs: https://razorpay.com/docs/api/
import { createHmac, timingSafeEqual } from "node:crypto";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  /** Overridable for automated tests against a local mock. Defaults to the real API. */
  apiBase?: string;
}

export function razorpayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || undefined,
    apiBase: env.RAZORPAY_API_BASE || "https://api.razorpay.com",
  };
}

function hmacHex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(cfg: RazorpayConfig, orderId: string, paymentId: string, signature: string): boolean {
  return safeEqualHex(hmacHex(cfg.keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret), header X-Razorpay-Signature. */
export function verifyWebhookSignature(secret: string, rawBody: string, signature: string): boolean {
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}

async function call<T>(cfg: RazorpayConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      authorization: "Basic " + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64"),
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay ${method} ${path} failed (${res.status}): ${json.error?.description ?? "unknown error"}`);
  return json;
}

export interface RzpOrder { id: string; amount: number; currency: string; receipt: string; status: string }
export interface RzpPayment { id: string; order_id: string; amount: number; currency: string; status: "created" | "authorized" | "captured" | "refunded" | "failed"; method?: string; error_code?: string | null; error_description?: string | null }
export interface RzpRefund { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed" }

export const razorpay = {
  createOrder: (cfg: RazorpayConfig, amountPaise: number, receipt: string, notes: Record<string, string>) =>
    call<RzpOrder>(cfg, "POST", "/v1/orders", { amount: amountPaise, currency: "INR", receipt, notes, payment_capture: 1 }),
  fetchPayment: (cfg: RazorpayConfig, paymentId: string) => call<RzpPayment>(cfg, "GET", `/v1/payments/${encodeURIComponent(paymentId)}`),
  capture: (cfg: RazorpayConfig, paymentId: string, amountPaise: number) =>
    call<RzpPayment>(cfg, "POST", `/v1/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" }),
  refund: (cfg: RazorpayConfig, paymentId: string, amountPaise: number, notes: Record<string, string>, idempotencyReceipt: string) =>
    call<RzpRefund>(cfg, "POST", `/v1/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, speed: "normal", notes, receipt: idempotencyReceipt }),
};

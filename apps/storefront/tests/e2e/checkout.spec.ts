import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { CRON_SECRET, E2E_DB, WEBHOOK_SECRET } from "../../playwright.config";

// Payments go to a LOCAL MOCK of the Razorpay API (tests/e2e/mock-razorpay.mjs).
// No real money moves; the server-side verification code runs unchanged.

const STUB = `
window.Razorpay = class {
  constructor(o) { this.o = o; }
  on(event, cb) { this.fail = cb; }
  open() {
    const mode = window.__rzpMode || "pay";
    if (mode === "dismiss") { this.o.modal.ondismiss(); return; }
    fetch("https://api.razorpay.com/__test_pay", { method: "POST", body: JSON.stringify({ order_id: this.o.order_id, forge: mode === "forge" }) })
      .then((r) => r.json()).then((r) => this.o.handler(r));
  }
};`;

const sql = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });

async function prepare(page: Page, mode: "pay" | "dismiss" | "forge" = "pay") {
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (r) => r.fulfill({ contentType: "application/javascript", body: STUB }));
  // the stub calls a Razorpay-domain URL (allowed by the site's CSP); the test forwards it to the local mock
  await page.route("https://api.razorpay.com/__test_pay", async (r) => {
    const res = await fetch("http://localhost:3999/__pay", { method: "POST", body: r.request().postData() ?? "{}" });
    await r.fulfill({ status: res.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: await res.text() });
  });
  await page.addInitScript((m) => { (window as unknown as { __rzpMode: string }).__rzpMode = m; document.cookie = "zentro_consent=essential; path=/"; }, mode);
}

async function fillAddress(page: Page, state: string, pincode: string) {
  await page.getByRole("textbox", { name: "Email" }).fill("priya@example.com");
  await page.getByLabel("Full name").fill("Priya Sharma");
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByLabel("Flat / house no., building, street").fill("12, 4th Cross, Indiranagar");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByLabel("Pincode").fill(pincode);
  await page.getByLabel("State").selectOption({ label: state });
}

async function stockOf(sku: string) {
  const s = sql();
  const [r] = await s<{ stock: number }[]>`select stock from shop.product_variants where sku = ${sku}`;
  await s.end();
  return r!.stock;
}

test.describe.configure({ mode: "serial" });

test("cart → checkout with coupon → verified payment → confirmed order", async ({ page }) => {
  await prepare(page);
  const before = await stockOf("ZN-003-2"); // sneakers UK 8
  await page.goto("/p/everyday-classic-sneakers");
  await page.locator("label", { hasText: "UK 8" }).click();
  await page.getByLabel("Quantity").selectOption("2");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart" }).getByText("2")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("₹3,598").first()).toBeVisible();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();

  await fillAddress(page, "Karnataka", "560038");
  await expect(page.getByText("Free")).toBeVisible();
  await page.getByLabel("Coupon code").fill("WELCOME10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("WELCOME10 applied.")).toBeVisible();
  // 10% of ₹3,598 is ₹359.80, capped at ₹300 by the coupon
  await expect(page.getByRole("button", { name: "Pay ₹3,298 securely" })).toBeVisible();
  await page.getByRole("checkbox", { name: "SMS" }).check();
  await page.getByRole("button", { name: /Pay .* securely/ }).click();

  await expect(page).toHaveURL(/\/order\/ZN\d+\?t=.+&placed=1/);
  await expect(page.getByText("Thank you — your order is confirmed!")).toBeVisible();
  await expect(page.getByText("Paid").first()).toBeVisible();

  const orderUrl = page.url().replace("&placed=1", "");
  const orderNumber = page.url().match(/order\/(ZN\d+)/)![1]!;
  const s = sql();
  const [o] = await s<{ status: string; paymentStatus: string; total: number; discount: number; tax: number }[]>`
    select status, payment_status as "paymentStatus", total_paise as total, discount_paise as discount, tax_paise as tax from shop.orders where order_number = ${orderNumber}`;
  expect(o).toMatchObject({ status: "confirmed", paymentStatus: "paid", total: 329800, discount: 30000 });
  const items = await s<{ cgst: number; sgst: number; igst: number }[]>`select cgst_paise as cgst, sgst_paise as sgst, igst_paise as igst from shop.order_items i join shop.orders o on o.id = i.order_id where o.order_number = ${orderNumber}`;
  expect(items[0]!.igst).toBe(0); // KA → KA: CGST + SGST
  expect(items[0]!.cgst + items[0]!.sgst).toBe(o!.tax);
  const consents = await s`select channel, status from shop.marketing_consents where recipient = '9876543210'`;
  expect(consents.map((c) => c.channel)).toEqual(["sms"]);
  const outbox = await s<{ channel: string }[]>`
    select channel from shop.notification_outbox where template = 'order_confirmed'
      and payload->>'orderId' = (select id::text from shop.orders where order_number = ${orderNumber}) order by channel`;
  expect(outbox.map((x) => x.channel)).toEqual(["email", "sms"]);
  await s.end();
  expect(await stockOf("ZN-003-2")).toBe(before - 2);

  // cart is emptied after purchase
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();

  // invoice: no GSTIN configured → receipt, intra-state columns
  await page.goto(orderUrl);
  await page.getByRole("link", { name: "Download invoice" }).click();
  await expect(page.getByRole("heading", { name: "Order Receipt" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "CGST" })).toBeVisible();

  // customer cancels → stock returned, refund processed via gateway
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByRole("status")).toContainText("full refund has been requested");
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  expect(await stockOf("ZN-003-2")).toBe(before);
  const s2 = sql();
  const [o2] = await s2<{ paymentStatus: string }[]>`select payment_status as "paymentStatus" from shop.orders where order_number = ${orderNumber}`;
  await s2.end();
  expect(o2!.paymentStatus).toBe("refunded");
});

test("buy now to another state uses IGST; abandoned payment holds then releases stock", async ({ page, request }) => {
  await prepare(page, "dismiss");
  const before = await stockOf("ZN-004-1"); // desk lamp
  await page.goto("/p/minimal-desk-lamp");
  await page.getByRole("button", { name: "Buy now" }).click();
  await expect(page).toHaveURL(/\/checkout\?buy=/);
  await fillAddress(page, "Maharashtra", "400001");
  await page.getByRole("button", { name: /Pay .* securely/ }).click();
  await expect(page.getByText(/Payment window closed/)).toBeVisible();
  expect(await stockOf("ZN-004-1")).toBe(before - 1); // reserved

  const s = sql();
  const [o] = await s<{ id: string; status: string; igst: number }[]>`
    select o.id, o.status, sum(i.igst_paise)::int as igst from shop.orders o join shop.order_items i on i.order_id = o.id
    where o.place_of_supply = 'MH' group by o.id order by o.created_at desc limit 1`;
  expect(o!.status).toBe("pending_payment");
  expect(o!.igst).toBeGreaterThan(0);

  expect((await request.get("/api/cron/maintenance")).status()).toBe(401);
  await s`update shop.orders set reservation_expires_at = now() - interval '1 minute' where id = ${o!.id}`;
  const cron = await request.get("/api/cron/maintenance", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(await cron.json()).toMatchObject({ releasedOrders: 1 });
  const [after] = await s<{ status: string }[]>`select status from shop.orders where id = ${o!.id}`;
  await s.end();
  expect(after!.status).toBe("cancelled");
  expect(await stockOf("ZN-004-1")).toBe(before);
});

test("cannot oversell: quantity above stock is refused at checkout", async ({ page }) => {
  await prepare(page);
  const s = sql();
  await s`update shop.product_variants set stock = 1 where sku = 'ZN-006-1'`;
  await s.end();
  await page.goto("/checkout?buy=" + (await variantId("ZN-006-1")) + "&qty=2");
  await fillAddress(page, "Karnataka", "560038");
  await expect(page.getByText(/Only 1 left of Portable Bluetooth Speaker/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay/ })).toBeDisabled();
});

test("a forged payment signature is rejected and the order stays unpaid", async ({ page }) => {
  await prepare(page, "forge");
  await page.goto("/p/modern-insulated-bottle");
  await page.getByRole("button", { name: "Buy now" }).click();
  await fillAddress(page, "Karnataka", "560038");
  await page.getByRole("button", { name: /Pay .* securely/ }).click();
  await expect(page.getByText(/couldn’t verify this payment/)).toBeVisible();
  const s = sql();
  const [o] = await s<{ paymentStatus: string }[]>`select payment_status as "paymentStatus" from shop.orders order by created_at desc limit 1`;
  await s.end();
  expect(o!.paymentStatus).toBe("pending");
});

test("webhook: bad signatures rejected, duplicate deliveries ignored", async ({ request }) => {
  const body = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_x", order_id: "order_none", amount: 1, currency: "INR", status: "failed" } } } });
  expect((await request.post("/api/webhooks/razorpay", { data: body, headers: { "content-type": "application/json", "x-razorpay-signature": "bad" } })).status()).toBe(401);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const h = { "content-type": "application/json", "x-razorpay-signature": sig, "x-razorpay-event-id": "evt_e2e_1" };
  expect(await (await request.post("/api/webhooks/razorpay", { data: body, headers: h })).json()).toMatchObject({ ok: true });
  expect(await (await request.post("/api/webhooks/razorpay", { data: body, headers: h })).json()).toMatchObject({ duplicate: true });
});

async function variantId(sku: string) {
  const s = sql();
  const [r] = await s<{ id: string }[]>`select id from shop.product_variants where sku = ${sku}`;
  await s.end();
  return r!.id;
}

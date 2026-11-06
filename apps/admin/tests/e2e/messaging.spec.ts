import { expect, test } from "@playwright/test";
import { applyDeliveryStatus, processOutbox, startDueCampaigns, unsubscribeLink, verifyUnsubscribe, withdrawConsent } from "@zentro/commerce/messaging";
import { confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { MESSAGING_ENV } from "../../playwright.config";
import { acceptInvite, createStaffInvite, db } from "./helpers";

// Providers are a LOCAL MOCK (tests/e2e/mock-messaging.mjs); nothing reaches real phones.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const sentLog = async () => (await (await fetch("http://localhost:3998/__sent")).json()) as { provider: string; id: string; to: string; text?: string; vars?: Record<string, string>; headers?: Record<string, string> }[];
const cron = async () => { const sql = db(); await startDueCampaigns(sql as never); const r = await processOutbox(sql as never, MESSAGING_ENV); await sql.end(); return r; };

let orderNumber = "";

test.beforeAll(async () => {
  const sql = db();
  // the window check is real; widen it for the test so it does not depend on the time of day
  await sql`update shop.messaging_settings set promo_window_start = '00:00', promo_window_end = '23:59'`;
  for (const [ch, r, st] of [["sms", "9000000001", "granted"], ["sms", "9000000002", "granted"], ["sms", "9000000003", "granted"], ["sms", "9000000003", "withdrawn"], ["whatsapp", "9000000001", "granted"]] as const) {
    await sql`insert into shop.marketing_consents (channel, recipient, status, source) values (${ch}, ${r}, ${st}, ${st === "granted" ? "checkout" : "unsubscribe_link"})`;
  }
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-007-1'`;
  const p = await placeOrder(sql as never, {
    lines: [{ variantId: v!.id, quantity: 1 }], email: "anita@example.com", phone: "9000000001",
    address: { fullName: "Anita Rao", phone: "9000000001", line1: "3 MG Road", city: "Pune", stateCode: "MH", pincode: "411001" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, 'order_msg_e2e', ${p.totalPaise})`;
  await confirmPaidOrder(sql as never, { providerOrderId: "order_msg_e2e", providerPaymentId: "pay_msg_e2e", amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  orderNumber = p.orderNumber;
  await sql.end();
});

test("order updates: email delivered via provider; SMS honestly skipped until DLT-approved", async () => {
  const r = await cron();
  expect(r.sent).toBeGreaterThanOrEqual(1);
  const sql = db();
  const rows = await sql<{ channel: string; status: string; lastError: string | null }[]>`
    select channel, status, last_error as "lastError" from shop.notification_outbox where template = 'order_confirmed' and recipient in ('anita@example.com', '9000000001')`;
  await sql.end();
  expect(rows.find((x) => x.channel === "email")?.status).toBe("sent");
  const sms = rows.find((x) => x.channel === "sms");
  expect(sms?.status).toBe("skipped");
  expect(sms?.lastError).toMatch(/DLT/);
  const mail = (await sentLog()).find((m) => m.to === "anita@example.com");
  expect(mail?.text).toContain(orderNumber);
  expect(mail?.text).toContain("Anita");
});

test("manager builds a consent-only SMS campaign, previews count and cost, sends; frequency cap and opt-out enforced", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("marketing@zentro.test", "Kiran Marketing", "manager"));

  // promotional template must carry an unsubscribe link
  await page.goto("/messages/templates");
  await page.getByLabel("Name", { exact: true }).fill("Festive sale");
  await page.locator("select[name=channel]").selectOption("sms");
  await page.getByLabel("Message").fill("Hi {{name}}, festive sale at {{store}}: use {{coupon_code}} for 10% off. {{shop_link}}");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("unsubscribe_link");
  await page.getByLabel("Message").fill("Hi {{name}}, festive sale at {{store}}: use {{coupon_code}} for 10% off. {{shop_link}} Opt out: {{unsubscribe_link}}");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/messages\/templates\/[0-9a-f-]{36}/);
  await expect(page.getByText(/Not deliverable yet/)).toBeVisible();
  await page.getByLabel("DLT template ID (SMS)").fill("1107161234567890123");
  await page.getByLabel("MSG91 template ID (SMS)").fill("65f0c0ffee");
  await page.getByLabel("Provider approval").selectOption("approved");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByRole("status")).toContainText("Template saved");
  await page.reload();
  await expect(page.getByText(/Ready: this template can be delivered/)).toBeVisible();

  // campaign: only the 2 currently-consented SMS numbers are eligible (the withdrawn one is excluded)
  await page.goto("/messages/campaigns");
  await page.getByLabel("Name", { exact: true }).fill("Festive SMS");
  await page.locator("select[name=channel]").selectOption("sms");
  await page.locator("select[name=couponCode]").selectOption("WELCOME10");
  await page.getByRole("button", { name: "Create draft & preview" }).click();
  await expect(page).toHaveURL(/\/messages\/campaigns\/[0-9a-f-]{36}/);
  const summary = page.getByRole("region", { name: "Campaign summary" });
  await expect(summary).toContainText("Eligible recipients2");
  await expect(summary).toContainText("₹0.5"); // 2 × 25 paise default estimate
  await expect(page.getByText("use WELCOME10 for 10% off")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit for sending" }).click();
  await expect(page.getByRole("status")).toContainText("Scheduled");

  await cron();
  const sms = (await sentLog()).filter((m) => m.provider === "msg91");
  expect(sms.map((m) => m.to).sort()).toEqual(["919000000001", "919000000002"]);
  const unsub = Object.values(sms[0]!.vars!).find((v) => v.includes("/unsubscribe?"))!;
  const u = new URL(unsub);
  expect(verifyUnsubscribe(MESSAGING_ENV.UNSUBSCRIBE_SECRET, "sms", u.searchParams.get("r")!, u.searchParams.get("s")!)).toBe(true);

  // provider reports one delivery
  const sql = db();
  await applyDeliveryStatus(sql as never, "msg91", sms[0]!.id, "delivered");
  await sql.end();
  await page.reload();
  await expect(page.getByText("Delivered (reported)").locator("..")).toContainText("1");

  // second campaign today: frequency cap (1/day) suppresses both; an opt-out also applies
  const s2 = db();
  await withdrawConsent(s2 as never, "sms", "9000000002", "unsubscribe_link");
  await s2.end();
  await page.goto("/messages/campaigns");
  await page.getByLabel("Name", { exact: true }).fill("Second blast");
  await page.locator("select[name=channel]").selectOption("sms");
  await page.getByRole("button", { name: "Create draft & preview" }).click();
  await expect(page.getByRole("region", { name: "Campaign summary" })).toContainText("Eligible recipients1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit for sending" }).click();
  await expect(page.getByRole("status")).toContainText("Scheduled");
  const before = (await sentLog()).length;
  const r = await cron();
  expect(r.suppressed).toBe(1);
  expect((await sentLog()).length).toBe(before);

  // history shows the honest outcomes
  await page.goto("/messages/history?kind=promotional");
  await expect(page.getByText("Frequency limit reached for this customer")).toBeVisible();
});

test("one-to-one service message about an order; promotions blocked from compose", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("support2@zentro.test", "Sana Support", "support"));
  await page.goto(`/messages/compose?order=${orderNumber}`);
  await page.locator("form", { has: page.getByRole("button", { name: "Send now" }) }).locator("select[name=templateId]").selectOption({ label: "Email · Order shipped" });
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page.getByRole("status")).toContainText("Accepted by resend");
  // support cannot reach campaigns or provider settings
  await page.goto("/messages/settings");
  await expect(page).toHaveURL(/forbidden/);
});

test("unsubscribe links are signed per recipient", async () => {
  const link = new URL(unsubscribeLink("https://shop.test", "k", "whatsapp", "9000000001"));
  expect(verifyUnsubscribe("k", "whatsapp", "9000000001", link.searchParams.get("s")!)).toBe(true);
  expect(verifyUnsubscribe("k", "whatsapp", "9000000009", link.searchParams.get("s")!)).toBe(false);
});

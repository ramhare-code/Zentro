import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { E2E_DB } from "../../playwright.config";

// Emails/SMS go to a LOCAL MOCK provider (apps/admin/tests/e2e/mock-messaging.mjs).
type Sent = { provider: string; to: string; text?: string; vars?: Record<string, string> };
const sent = async (): Promise<Sent[]> => (await fetch("http://localhost:3998/__sent")).json();
const linkIn = async (to: string, path: string) => {
  const m = (await sent()).reverse().find((x) => x.to === to && x.text?.includes(path));
  return m?.text?.match(new RegExp(`https?://[^\\s]*${path.replace("/", "\\/")}[^\\s]*`))?.[0];
};
const sql = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });
const EMAIL = "rahul.k@example.com";
const PW = "monsoon-mango-lassi-7";

async function noBanner(page: Page) {
  await page.addInitScript(() => { document.cookie = "zentro_consent=essential; path=/"; });
}

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({}, info) => test.skip(info.project.name !== "desktop"));

test("register → verify email → earlier guest orders appear in My orders", async ({ page }) => {
  await noBanner(page);
  // a guest order placed before the account existed
  const s = sql();
  const [v] = await s<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-005-1'`;
  const p = await placeOrder(s as never, {
    lines: [{ variantId: v!.id, quantity: 1 }], email: EMAIL, phone: "9845012345",
    address: { fullName: "Rahul K", phone: "9845012345", line1: "21 Residency Road", city: "Bengaluru", stateCode: "KA", pincode: "560025" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  await s`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, 'order_acct', ${p.totalPaise})`;
  await confirmPaidOrder(s as never, { providerOrderId: "order_acct", providerPaymentId: "pay_acct", amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  await s.end();

  await page.goto("/account/register");
  await page.getByLabel("Full name").fill("Rahul Kumar");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("password1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("too easy to guess");
  await expect(page.getByLabel("Email")).toHaveValue(EMAIL); // input kept
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account\?welcome=1/);
  await expect(page.getByText(`We’ve sent a verification link to ${EMAIL}`)).toBeVisible();
  await expect(page.getByText("No orders yet.")).toBeVisible(); // not linked until verified

  const link = await linkIn(EMAIL, "/account/verify");
  expect(link).toBeTruthy();
  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await page.goto("/account/orders");
  await expect(page.getByRole("link", { name: new RegExp(p.orderNumber) })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(p.orderNumber) }).click();
  await expect(page).toHaveURL(new RegExp(`/order/${p.orderNumber}\\?t=`));
});

test("sign in errors, guest cart merges on sign-in, saved address prefills checkout", async ({ page }) => {
  await noBanner(page);
  await page.goto("/p/minimal-desk-lamp");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();

  await page.goto("/account/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong password here");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Email or password is incorrect");
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto("/cart");
  await expect(page.getByRole("link", { name: "Minimal Desk Lamp" })).toBeVisible();

  await page.goto("/account");
  await page.getByText("+ Add a new address").click();
  const form = page.locator("form", { has: page.getByRole("button", { name: "Add address" }) });
  await form.getByLabel("Label").fill("Home");
  await form.getByLabel("Full name").fill("Rahul Kumar");
  await form.getByLabel("Mobile").fill("9845012345");
  await form.getByLabel("Flat / house, street").fill("21 Residency Road");
  await form.getByLabel("City").fill("Bengaluru");
  await form.getByLabel("Pincode").fill("560025");
  await form.getByLabel("State").selectOption({ label: "Karnataka" });
  await form.getByRole("button", { name: "Add address" }).click();
  await expect(form.getByRole("status")).toContainText("Address saved");

  await page.goto("/checkout");
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(EMAIL);
  await expect(page.getByLabel("Flat / house no., building, street")).toHaveValue("21 Residency Road");
  await expect(page.getByRole("button", { name: /Pay ₹1,299 securely/ })).toBeVisible();
});

test("phone OTP is refused honestly until the SMS template is DLT-approved, then verifies; offers per channel", async ({ page }) => {
  await noBanner(page);
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.getByLabel(/Mobile number/).fill("9845012345");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("SMS service isn’t set up");

  const s = sql();
  await s`update shop.message_templates set dlt_template_id = '1107000000000000001', provider_template_id = 'otp_flow', approval_status = 'approved' where key = 'phone_otp'`;
  await s.end();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("status")).toContainText("We sent a 6-digit code");
  const otp = (await sent()).reverse().find((m) => m.provider === "msg91" && m.to === "919845012345")!.vars!.var1!;
  await page.getByLabel("6-digit code").fill(otp === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("isn’t right");
  await page.getByLabel("6-digit code").fill(otp);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText("Mobile number verified");

  await page.reload();
  const sms = page.locator("form", { hasText: "SMS offers" });
  await sms.getByRole("button", { name: "Subscribe" }).click();
  await expect(sms.getByRole("status")).toContainText("subscribed");
  const s2 = sql();
  const [c] = await s2<{ status: string; source: string }[]>`select status, source from shop.marketing_consents where channel = 'sms' and recipient = '9845012345' order by id desc limit 1`;
  await s2.end();
  expect(c).toEqual({ status: "granted", source: "account" });
});

test("password reset signs out other sessions; account deletion anonymises and blocks sign-in", async ({ page, browser }) => {
  await noBanner(page);
  const other = await browser.newContext();
  const op = await other.newPage();
  await op.goto("/account/login");
  await op.getByLabel("Email").fill(EMAIL);
  await op.getByLabel("Password").fill(PW);
  await op.getByRole("button", { name: "Sign in" }).click();
  await expect(op).toHaveURL(/\/account$/);

  await page.goto("/account/forgot");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  const link = (await linkIn(EMAIL, "/account/reset"))!;
  const NEWPW = "saffron-tea-kettle-42";
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.getByLabel("New password").fill(NEWPW);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/account\?reset=1/);
  await op.goto("/account");
  await expect(op).toHaveURL(/\/account\/login/); // old session revoked
  await other.close();

  // reused reset link is dead
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.getByLabel("New password").fill("another-strong-pass-9");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("expired");

  await page.goto("/account");
  await page.getByLabel("Password", { exact: true }).fill(NEWPW);
  await page.getByLabel("Type DELETE").fill("DELETE");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/account_deleted=1/);

  const s = sql();
  const [c] = await s<{ status: string; email: string; phone: string | null }[]>`select status, email, phone from shop.customers where full_name = 'Deleted customer'`;
  const consents = await s<{ status: string }[]>`select distinct on (channel) status from shop.marketing_consents where recipient in (${EMAIL}, '9845012345') order by channel, id desc`;
  const [orders] = await s<{ n: number }[]>`select count(*)::int as n from shop.orders where email = ${EMAIL} and user_id is null`;
  await s.end();
  expect(c!.status).toBe("deleted");
  expect(c!.email).toMatch(/@deleted\.invalid$/);
  expect(c!.phone).toBeNull();
  expect(consents.every((x) => x.status === "withdrawn")).toBe(true);
  expect(orders!.n).toBeGreaterThanOrEqual(1); // kept for tax records, unlinked

  await page.goto("/account/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(NEWPW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("incorrect");
});

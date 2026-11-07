import { expect, test } from "@playwright/test";
import { confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
const DAY = "2026-02-10", RANGE = `from=${DAY}&to=${DAY}`;
const placedOn: Record<string, string> = {};

test.beforeAll(async () => {
  const sql = db();
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-007-2'`;
  const make = async (tag: string, email: string, name: string, when: string) => {
    const o = await placeOrder(sql as never, {
      lines: [{ variantId: v!.id, quantity: 2 }], email, phone: "9988776655", sellerStateCode: "KA", idempotencyKey: crypto.randomUUID(), whatsappUpdates: false,
      address: { fullName: name, phone: "9988776655", line1: "5 Residency Road", city: "Bengaluru", stateCode: "KA", pincode: "560025" },
    });
    await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${o.orderId}, ${"order_an_" + tag}, ${o.totalPaise})`;
    await confirmPaidOrder(sql as never, { providerOrderId: "order_an_" + tag, providerPaymentId: "pay_an_" + tag, amountPaise: o.totalPaise, currency: "INR", status: "captured", method: "upi" });
    await sql`update shop.orders set placed_at = ${when + "T12:00:00+05:30"} where id = ${o.orderId}`;
    placedOn[tag] = o.orderNumber;
  };
  await make("first", "repeat.buyer@example.com", "Ritu Sen", "2026-02-01"); // earlier order: makes the next one a returning customer
  await make("again", "repeat.buyer@example.com", "Ritu Sen", DAY);
  await make("new", "new.buyer@example.com", "=HYPERLINK(\"http://evil\")", DAY);
  await sql.end();
});

test("manager sees new vs returning customers and downloads full reports", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("insight@zentro.test", "Pooja Insight", "manager"));
  await page.goto(`/analytics/customers?${RANGE}`);
  const totals = page.getByRole("region", { name: "Customer totals" });
  await expect(totals).toContainText("Paying customers2");
  await expect(totals).toContainText("1 new · 1 returning");
  await expect(totals).toContainText("1 from returning customers");
  await expect(page.getByRole("region", { name: "Sales by state" })).toContainText("Karnataka (KA)");
  await expect(page.getByRole("region", { name: "Top customers" })).toContainText("repeat.buyer@example.com");

  await page.getByRole("link", { name: "Reports & exports" }).click();
  await expect(page).toHaveURL(new RegExp(`/analytics/reports\\?from=${DAY}&to=${DAY}`));
  const orders = await (await page.request.get(`/api/reports/orders?${RANGE}`)).text();
  const lines = orders.trim().split("\r\n");
  expect(lines).toHaveLength(3);
  expect(orders).toContain(placedOn.again);
  expect(orders).toContain("repeat.buyer@example.com");
  expect(orders).not.toContain(placedOn.first);
  expect(orders).toContain(`"'=HYPERLINK(""http://evil"")"`); // a spreadsheet won't run it
  const items = await (await page.request.get(`/api/reports/order-items?${RANGE}`)).text();
  expect(items).toMatch(/ZN-007-2,.*,2,0,/);
  expect((await page.request.get(`/api/reports/nope?${RANGE}`)).status()).toBe(400);
});

test("finance staff get masked contact details; support can't open analytics", async ({ page, browser }) => {
  await acceptInvite(page, await createStaffInvite("numbers@zentro.test", "Hari Finance", "finance"));
  await page.goto(`/analytics/reports?${RANGE}`);
  await expect(page.getByText("Customer emails and phone numbers are masked")).toBeVisible();
  const csv = await (await page.request.get(`/api/reports/customers?${RANGE}`)).text();
  expect(csv).not.toContain("repeat.buyer@example.com");
  expect(csv).toMatch(/r•+@example\.com/);
  expect(csv).toContain("••••••6655");
  const sql = db();
  const [a] = await sql<{ n: number }[]>`select count(*)::int as n from shop.audit_log where action = 'report.export' and details->>'pii' = 'false'`;
  expect(a!.n).toBeGreaterThanOrEqual(1);
  await sql.end();

  const other = await browser.newPage();
  await acceptInvite(other, await createStaffInvite("care6@zentro.test", "Tia Care", "support"));
  await other.goto("/analytics/customers");
  await expect(other).toHaveURL(/\/forbidden/);
  expect((await other.request.get(`/api/reports/orders?${RANGE}`)).status()).toBe(403);
  await other.close();
});

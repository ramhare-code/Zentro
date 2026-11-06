import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { advanceOrder, confirmPaidOrder, placeOrder, rotateGuestToken } from "@zentro/commerce/orders";
import { E2E_DB } from "../../playwright.config";

const sql = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.addInitScript(() => { document.cookie = "zentro_consent=essential; path=/"; });
});

test("customer requests a return within the window; the window closes after it", async ({ page }) => {
  const s = sql();
  const [v] = await s<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-007-1'`;
  const p = await placeOrder(s as never, {
    lines: [{ variantId: v!.id, quantity: 3 }], email: "kavya@example.com", phone: "9876501234",
    address: { fullName: "Kavya Reddy", phone: "9876501234", line1: "8 Jubilee Hills", city: "Hyderabad", stateCode: "TG", pincode: "500033" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  await s`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, 'order_cust_ret', ${p.totalPaise})`;
  await confirmPaidOrder(s as never, { providerOrderId: "order_cust_ret", providerPaymentId: "pay_cust_ret", amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  for (const to of ["processing", "packed"] as const) await advanceOrder(s as never, p.orderId, to, { actor: "operations" });
  await advanceOrder(s as never, p.orderId, "shipped", { actor: "operations", shipment: { carrier: "Delhivery" } });
  await advanceOrder(s as never, p.orderId, "delivered", { actor: "operations" });
  const url = `/order/${p.orderNumber}?t=${encodeURIComponent(await rotateGuestToken(s as never, p.orderId))}`;

  await page.goto(url);
  await page.getByRole("button", { name: "Request a return" }).click();
  await page.getByRole("button", { name: "Submit return request" }).click(); // nothing chosen
  await page.getByLabel("Reason").selectOption("damaged");
  await page.getByRole("button", { name: "Submit return request" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Choose at least one item");
  await page.getByLabel(/Quantity of Modern Insulated Bottle/).selectOption("2");
  await page.getByLabel("Details").fill("Two bottles arrived dented.");
  await page.getByRole("button", { name: "Submit return request" }).click();
  await expect(page.getByRole("status")).toContainText("Return requested");
  await page.reload();
  await expect(page.getByRole("region", { name: "Return" })).toContainText("Return: Requested");
  await expect(page.getByRole("region", { name: "Return" })).toContainText("2 × Modern Insulated Bottle");
  // one bottle is still returnable
  await page.getByRole("button", { name: "Request a return" }).click();
  await expect(page.getByLabel(/Quantity of Modern Insulated Bottle/).locator("option")).toHaveCount(2);

  await s`update shop.orders set delivered_at = now() - interval '30 days' where id = ${p.orderId}`;
  await s.end();
  await page.reload();
  await expect(page.getByRole("button", { name: "Request a return" })).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

let orderNumber = "";

test.beforeAll(async () => {
  const sql = db();
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-004-1'`;
  const placed = await placeOrder(sql as never, {
    lines: [{ variantId: v!.id, quantity: 2 }], email: "meera@example.com", phone: "9123456780",
    address: { fullName: "Meera Iyer", phone: "9123456780", line1: "7 Lake View Road", city: "Chennai", stateCode: "TN", pincode: "600001" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: true, sellerStateCode: "KA",
  });
  await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${placed.orderId}, 'order_e2e_admin', ${placed.totalPaise})`;
  const r = await confirmPaidOrder(sql as never, { providerOrderId: "order_e2e_admin", providerPaymentId: "pay_e2e_admin", amountPaise: placed.totalPaise, currency: "INR", status: "captured", method: "upi" });
  expect(r.kind).toBe("confirmed");
  orderNumber = placed.orderNumber;
  await sql.end();
});

test("owner fulfils an order end to end; customer notifications are queued", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("ops-manager@zentro.test", "Ravi Ops", "manager"));

  await page.goto("/orders");
  const row = page.getByRole("row", { name: new RegExp(orderNumber) });
  await expect(row).toContainText("Confirmed");
  await expect(row).toContainText("paid");
  await expect(row).toContainText("Meera Iyer");
  await row.getByRole("link", { name: orderNumber }).click();

  await page.getByRole("button", { name: "Start processing" }).click();
  await expect(page.getByRole("status")).toContainText("Order marked processing");
  await page.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.getByRole("status")).toContainText("marked packed");
  // shipping requires a carrier
  await page.getByLabel("Carrier").fill("Delhivery");
  await page.getByLabel("Tracking / AWB number").fill("DLV123456789");
  await page.getByLabel("Tracking link").fill("https://www.delhivery.com/track/package/DLV123456789");
  await page.getByRole("button", { name: "Mark shipped" }).click();
  await expect(page.getByRole("status")).toContainText("customer notification has been queued");
  await page.reload();
  await expect(page.getByText("Delhivery · DLV123456789")).toBeVisible();
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByRole("status")).toContainText("marked delivered");
  await page.reload();
  await expect(page.getByText("Delivered — no further steps.")).toBeVisible();

  // internal note
  await page.getByPlaceholder("Only staff can see this").fill("Customer asked for evening delivery.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("status")).toContainText("Note added");

  const sql = db();
  const outbox = await sql<{ template: string; channel: string }[]>`
    select template, channel from shop.notification_outbox where payload->>'orderId' = (select id::text from shop.orders where order_number = ${orderNumber}) order by id`;
  const audit = await sql<{ n: number }[]>`select count(*)::int as n from shop.audit_log where action = 'order.status_change'`;
  await sql.end();
  expect(outbox.filter((o) => o.template === "order_shipped").map((o) => o.channel).sort()).toEqual(["email", "sms", "whatsapp"]);
  expect(outbox.some((o) => o.template === "order_delivered")).toBe(true);
  expect(audit[0]!.n).toBe(4);
});

import { expect, test } from "@playwright/test";
import { advanceOrder, confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

const SHOP = "http://localhost:3202";
const COURIER = "http://localhost:3997";
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

async function packedOrder(tag: string, pincode = "560034") {
  const sql = db();
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-004-1'`;
  const placed = await placeOrder(sql as never, {
    lines: [{ variantId: v!.id, quantity: 1 }], email: `${tag}@example.com`, phone: "9876501234", sellerStateCode: "KA",
    address: { fullName: "Neha Rao", phone: "9876501234", line1: "21 Koramangala 5th Block", city: "Bengaluru", stateCode: "KA", pincode },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false,
  });
  await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${placed.orderId}, ${"order_c_" + tag}, ${placed.totalPaise})`;
  await confirmPaidOrder(sql as never, { providerOrderId: "order_c_" + tag, providerPaymentId: "pay_c_" + tag, amountPaise: placed.totalPaise, currency: "INR", status: "captured", method: "upi" });
  await advanceOrder(sql as never, placed.orderId, "processing", { actor: "operations" });
  await advanceOrder(sql as never, placed.orderId, "packed", { actor: "operations" });
  await sql.end();
  return placed;
}

test("staff books a courier, prints the label, and tracking moves the order to delivered", async ({ page, request }) => {
  const o = await packedOrder("courier1");
  await acceptInvite(page, await createStaffInvite("dispatch@zentro.test", "Vikram Dispatch", "manager"));
  await page.goto(`/orders/${o.orderId}`);
  const courier = page.getByRole("region", { name: "Courier & label" });
  await courier.getByLabel("Weight (kg)").fill("0");
  await courier.getByRole("button", { name: "Book courier" }).click();
  await expect(courier.locator('p[role="alert"]')).toContainText("Weight must be between 10 g and 50 kg");
  await courier.getByLabel("Weight (kg)").fill("0.6");
  await courier.getByRole("button", { name: "Book courier" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Booked with Delhivery Surface — AWB AWB\d+77/ })).toBeVisible();

  const sql = db();
  const [sh] = await sql<{ awb: string; provider: string; label: string; status: string; orderStatus: string; weight: number }[]>`
    select s.tracking_number as awb, s.provider, s.label_url as label, s.status, o.status as "orderStatus", s.weight_grams as weight
    from shop.shipments s join shop.orders o on o.id = s.order_id where s.order_id = ${o.orderId}`;
  expect(sh).toMatchObject({ provider: "shiprocket", status: "in_transit", orderStatus: "shipped", weight: 600 });
  expect(sh!.label).toMatch(/^https:\/\/labels\.example\.test\//);
  const [notified] = await sql`select 1 from shop.notification_outbox where template = 'order_shipped' and payload->>'orderId' = ${o.orderId}`;
  expect(notified).toBeTruthy();
  const sent = (await (await fetch(`${COURIER}/__orders`)).json()) as { order_id: string; pickup_location: string; billing_pincode: string; weight: number }[];
  expect(sent.find((x) => x.order_id === o.orderNumber)).toMatchObject({ pickup_location: "Primary", billing_pincode: "560034", weight: 0.6 });

  // a second booking is refused
  await page.reload();
  await expect(page.getByRole("button", { name: "Book courier" })).toHaveCount(0);

  // printable label + packing slip
  await page.getByRole("link", { name: "Print label & packing slip" }).click();
  const label = page.getByRole("region", { name: `Label for ${o.orderNumber}` });
  await expect(label).toContainText("560034");
  await expect(label).toContainText(`AWB ${sh!.awb}`);
  await expect(label.getByRole("img", { name: `QR code ${sh!.awb}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print 1 label" })).toBeVisible();

  // courier webhook: authenticated, de-duplicated
  const hook = (key: string, scans: object[]) => request.post(`${SHOP}/api/webhooks/courier`, { headers: { "x-api-key": key }, data: { awb: sh!.awb, scans } });
  expect((await hook("wrong", [])).status()).toBe(401);
  const scans = [
    { date: "2026-11-07 09:10:00", activity: "Shipment picked up", location: "Bengaluru Hub", "sr-status-label": "PICKED UP" },
    { date: "2026-11-07 18:40:00", activity: "Out for delivery", location: "Koramangala", "sr-status-label": "OUT FOR DELIVERY" },
  ];
  const first = await hook("e2e-courier-hook", scans);
  expect(await first.json()).toMatchObject({ ok: true, added: 2 });
  expect(await (await hook("e2e-courier-hook", scans)).json()).toMatchObject({ ok: true, added: 0 });
  const [afterHook] = await sql<{ status: string }[]>`select status from shop.orders where id = ${o.orderId}`;
  expect(afterHook!.status).toBe("out_for_delivery");

  // pulling tracking delivers it
  await fetch(`${COURIER}/__track`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ awb: sh!.awb, activities: [...scans.map((s) => ({ ...s })), { date: "2026-11-08 11:05:00", activity: "Delivered to customer", location: "Koramangala", "sr-status-label": "DELIVERED" }] }) });
  await page.goto(`/orders/${o.orderId}`);
  await page.getByRole("button", { name: "Sync tracking now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tracking updated." })).toBeVisible();
  const [done] = await sql<{ status: string; deliveredAt: Date }[]>`select status, delivered_at as "deliveredAt" from shop.orders where id = ${o.orderId}`;
  expect(done!.status).toBe("delivered");
  await page.reload();
  await expect(page.getByRole("list", { name: "Tracking history" }).getByRole("listitem")).toHaveCount(3);
  await sql.end();
});

test("packed orders print together, and labels need permission to see addresses", async ({ page }) => {
  const a = await packedOrder("courier2", "560001"), b = await packedOrder("courier3", "560002");
  await acceptInvite(page, await createStaffInvite("dispatch2@zentro.test", "Meena Dispatch", "manager"));
  await page.goto("/orders");
  await page.getByRole("link", { name: "Print labels for packed orders" }).click();
  await expect(page.getByRole("region", { name: `Label for ${a.orderNumber}` })).toBeVisible();
  await expect(page.getByRole("region", { name: `Label for ${b.orderNumber}` })).toBeVisible();

  await page.context().clearCookies();
  await acceptInvite(page, await createStaffInvite("stock3@zentro.test", "Ajay Stock", "inventory"));
  await page.goto(`/orders/${a.orderId}/label`);
  await expect(page).toHaveURL(/\/forbidden/);
});

import { expect, test, type Page } from "@playwright/test";
import { placeOrder } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RZP = "http://localhost:3999";
const AUTH = "Basic " + Buffer.from("rzp_test_mock:mock_secret").toString("base64");
const orders: Record<"paidLost" | "abandoned" | "declined" | "webhook", { id: string; number: string; total: number; rzpOrder: string; paymentRow: string }> = {} as never;
let lostPaymentId = "", dupPaymentId = "", webhookPaymentId = "";

async function rzpOrder(amount: number) {
  const r = await fetch(`${RZP}/v1/orders`, { method: "POST", headers: { authorization: AUTH, "content-type": "application/json" }, body: JSON.stringify({ amount, currency: "INR", receipt: "e2e" }) });
  return ((await r.json()) as { id: string }).id;
}
async function customerPays(orderId: string, amount: number, status = "captured") {
  const r = await fetch(`${RZP}/__pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: orderId, amount, status }) });
  return ((await r.json()) as { razorpay_payment_id: string }).razorpay_payment_id;
}

test.beforeAll(async () => {
  const sql = db();
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-003-1'`;
  for (const key of ["paidLost", "abandoned", "declined", "webhook"] as const) {
    const placed = await placeOrder(sql as never, {
      lines: [{ variantId: v!.id, quantity: 1 }], email: `${key}@example.com`, phone: "9123456780",
      address: { fullName: "Kiran Rao", phone: "9123456780", line1: "12 MG Road", city: "Bengaluru", stateCode: "KA", pincode: "560001" },
      idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
    });
    const rzp = await rzpOrder(placed.totalPaise);
    const [p] = await sql<{ id: string }[]>`
      insert into shop.payments (order_id, provider_order_id, amount_paise, created_at) values (${placed.orderId}, ${rzp}, ${placed.totalPaise}, now() - interval '40 minutes') returning id`;
    orders[key] = { id: placed.orderId, number: placed.orderNumber, total: placed.totalPaise, rzpOrder: rzp, paymentRow: p!.id };
  }
  // the customer paid but closed the tab before the callback, and the webhook never arrived
  lostPaymentId = await customerPays(orders.paidLost.rzpOrder, orders.paidLost.total);
  await customerPays(orders.declined.rzpOrder, orders.declined.total, "failed");
  // a webhook that failed to process (e.g. a deploy mid-request); the payment itself succeeded
  webhookPaymentId = await customerPays(orders.webhook.rzpOrder, orders.webhook.total);
  await sql`insert into shop.payment_webhook_events (provider, event_id, event_type, payload, error)
            values ('razorpay', 'evt_e2e_failed', 'payment.captured',
                    ${sql.json({ event: "payment.captured", payload: { payment: { entity: { id: webhookPaymentId, order_id: orders.webhook.rzpOrder } } } })},
                    'connection terminated unexpectedly')`;
  await sql.end();
});

const stuckRow = (page: Page, orderNumber: string) => page.getByRole("listitem").filter({ hasText: orderNumber }).filter({ has: page.getByRole("button") });

test("finance reconciles payments with Razorpay, retries a failed event and matches a settlement report", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("money@zentro.test", "Farah Finance", "finance"));
  await page.goto("/payments/reconcile");

  const lost = stuckRow(page, orders.paidLost.number);
  await lost.getByRole("button", { name: "Check with Razorpay" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Order ${orders.paidLost.number} is now confirmed` })).toBeVisible();

  await stuckRow(page, orders.abandoned.number).getByRole("button", { name: "Check with Razorpay" }).click();
  await expect(page.getByRole("status").filter({ hasText: "didn’t complete it" })).toBeVisible();
  await stuckRow(page, orders.declined.number).getByRole("button", { name: "Check with Razorpay" }).click();
  await expect(page.getByRole("status").filter({ hasText: "failed: Payment declined by bank" })).toBeVisible();

  const sql = db();
  const st = await sql<{ number: string; status: string; payment: string; fee: number | null }[]>`
    select o.order_number as number, o.status, o.payment_status as payment, p.fee_paise as fee from shop.orders o join shop.payments p on p.order_id = o.id
    where o.id in ${sql([orders.paidLost.id, orders.abandoned.id, orders.declined.id])}`;
  const by = Object.fromEntries(st.map((r) => [r.number, r]));
  expect(by[orders.paidLost.number]).toMatchObject({ status: "confirmed", payment: "paid", fee: Math.round(orders.paidLost.total * 0.0236) });
  expect(by[orders.abandoned.number]).toMatchObject({ status: "pending_payment" });
  expect(by[orders.declined.number]).toMatchObject({ status: "payment_failed", payment: "failed" });
  const [inv] = await sql`select 1 from shop.invoices where order_id = ${orders.paidLost.id}`;
  expect(inv).toBeTruthy();

  // the customer pays a second time for the same, already-paid order → refunded automatically
  const rzp2 = await rzpOrder(orders.paidLost.total);
  const [p2] = await sql<{ id: string }[]>`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${orders.paidLost.id}, ${rzp2}, ${orders.paidLost.total}) returning id`;
  dupPaymentId = await customerPays(rzp2, orders.paidLost.total);
  await page.goto(`/payments/${p2!.id}`);
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByRole("status")).toContainText("second payment");
  const [ref] = await sql<{ status: string; amount: number }[]>`select status, amount_paise as amount from shop.refunds where payment_id = ${p2!.id}`;
  expect(ref).toEqual({ status: "processed", amount: orders.paidLost.total });
  const [o] = await sql<{ status: string }[]>`select status from shop.orders where id = ${orders.paidLost.id}`;
  expect(o!.status).toBe("confirmed"); // the original order is untouched
  await sql.end();

  // ---- a failed gateway event can be retried, and only once
  await page.goto("/payments/webhooks?failed=1");
  const row = page.getByRole("row").filter({ hasText: webhookPaymentId });
  await expect(row).toContainText("connection terminated unexpectedly");
  await row.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Processed successfully" })).toBeVisible();
  const sql2 = db();
  const [o2] = await sql2<{ status: string }[]>`select status from shop.orders where id = ${orders.webhook.id}`;
  expect(o2!.status).toBe("confirmed");
  await sql2.end();
  await page.goto("/payments/webhooks");
  await expect(page.getByRole("row").filter({ hasText: webhookPaymentId })).toContainText("Processed after 2 attempts");
  await expect(page.getByRole("row").filter({ hasText: webhookPaymentId }).getByRole("button", { name: "Retry" })).toHaveCount(0);

  // ---- a settlement report is matched and only exact matches are recorded
  const rupees = (p: number) => (p / 100).toFixed(2);
  const fee = Math.round(orders.paidLost.total * 0.0236);
  const csv = [
    "entity_id,type,debit,credit,amount,currency,fee,tax,on_hold,settled,created_at,settled_at,settlement_id",
    `${lostPaymentId},payment,0,"${rupees(orders.paidLost.total)}","${rupees(orders.paidLost.total)}",INR,${rupees(fee)},0.36,0,1,,2026-11-03 09:00:00,setl_E2E1`,
    `${webhookPaymentId},payment,0,1.00,1.00,INR,0.02,0.00,0,1,,2026-11-03 09:00:00,setl_E2E1`,
    `pay_NotOurs123,payment,0,500.00,500.00,INR,11.80,1.80,0,1,,2026-11-03 09:00:00,setl_E2E1`,
  ].join("\n");
  await page.goto("/payments/reconcile");
  await page.getByLabel("Report (CSV)").setInputFiles({ name: "settlement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Check report" }).click();
  const check = page.getByLabel("Report check");
  await expect(check).toContainText("3 line(s): 3 payment(s), 0 refund(s), 0 other · 1 matched · 2 need attention");
  await expect(check).toContainText("Amount differs");
  await expect(check).toContainText("Not in Zentro");
  await page.getByRole("button", { name: "Record matches" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recorded 1 matched line(s). 2 line(s) need attention" })).toBeVisible();
  const sql3 = db();
  const rows = await sql3<{ id: string; settlement: string | null }[]>`select provider_payment_id as id, settlement_id as settlement from shop.payments where provider_payment_id in ${sql3([lostPaymentId, webhookPaymentId])}`;
  expect(Object.fromEntries(rows.map((r) => [r.id, r.settlement]))).toEqual({ [lostPaymentId]: "setl_E2E1", [webhookPaymentId]: null });
  await sql3.end();
  await page.reload();
  await expect(page.getByRole("region", { name: "Imported reports" })).toContainText("settlement.csv");

  // dashboard numbers come from the verified records
  await page.goto("/payments");
  await expect(page.getByRole("region", { name: "Payment summary" })).toContainText("Captured");
  await page.getByLabel("Order number or Razorpay id").fill(orders.declined.number);
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Payment declined by bank");
});

test("support staff cannot open payments", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("care3@zentro.test", "Joel Care", "support"));
  await page.goto("/payments");
  await expect(page).toHaveURL(/\/forbidden/);
});

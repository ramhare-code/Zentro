import { expect, test } from "@playwright/test";
import { advanceOrder, confirmPaidOrder, placeOrder, requestReturn } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

// Refunds go to a LOCAL MOCK of the Razorpay API.
test.setTimeout(120_000);

test("manager approves a return, receives it, restocks and refunds exactly the returned item", async ({ page }) => {
  const sql = db();
  const [v] = await sql<{ id: string; stock: number }[]>`select id, stock from shop.product_variants where sku = 'ZN-002-1'`;
  const p = await placeOrder(sql as never, {
    lines: [{ variantId: v!.id, quantity: 2 }], email: "neha@example.com", phone: "9811100000",
    address: { fullName: "Neha Gupta", phone: "9811100000", line1: "5 Hazratganj", city: "Lucknow", stateCode: "UP", pincode: "226001" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, 'order_ret', ${p.totalPaise})`;
  await confirmPaidOrder(sql as never, { providerOrderId: "order_ret", providerPaymentId: "pay_ret", amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  for (const to of ["processing", "packed"] as const) await advanceOrder(sql as never, p.orderId, to, { actor: "operations" });
  await advanceOrder(sql as never, p.orderId, "shipped", { actor: "operations", shipment: { carrier: "Ekart" } });
  await advanceOrder(sql as never, p.orderId, "delivered", { actor: "operations" });
  const [item] = await sql<{ id: string; lineTotal: number }[]>`select id, line_total_paise as "lineTotal" from shop.order_items where order_id = ${p.orderId}`;
  await requestReturn(sql as never, p.orderId, { items: [{ orderItemId: item!.id, quantity: 1 }], reason: "defective", details: "Strap broke on day two", windowDays: 7 });
  const stockAfterSale = v!.stock - 2;
  await sql.end();

  await acceptInvite(page, await createStaffInvite("returns@zentro.test", "Arjun Ops", "manager"));
  await page.goto(`/orders/${p.orderId}`);
  const ret = page.getByRole("region", { name: "Return request" });
  await expect(ret).toContainText("Return · Requested");
  await expect(ret).toContainText("Strap broke on day two");

  await ret.getByRole("button", { name: "Reject" }).click();
  await expect(ret.locator('p[role="alert"]')).toContainText("Tell the customer why");
  await ret.getByPlaceholder(/Note for the customer/).fill("Approved — a courier will collect it within 2 days.");
  await ret.getByRole("button", { name: "Approve" }).click();
  await expect(ret.getByRole("status")).toContainText("Return marked approved");
  await page.reload();
  page.once("dialog", (d) => d.accept());
  await ret.getByRole("button", { name: "Received & refund" }).click();
  await expect(ret.getByRole("status")).toContainText("Refund of ₹2,499 processed by Razorpay");

  const s2 = db();
  const [after] = await s2<{ stock: number }[]>`select stock from shop.product_variants where sku = 'ZN-002-1'`;
  const [o] = await s2<{ status: string; paymentStatus: string }[]>`select status, payment_status as "paymentStatus" from shop.orders where id = ${p.orderId}`;
  const [r] = await s2<{ status: string; amount: number }[]>`select rr.status, f.amount_paise as amount from shop.return_requests rr join shop.refunds f on f.id = rr.refund_id where rr.order_id = ${p.orderId}`;
  const notes = await s2<{ status: string }[]>`select payload->>'status' as status from shop.notification_outbox where template = 'return_update' and payload->>'orderId' = ${p.orderId} and channel = 'email' order by id`;
  await s2.end();
  expect(after!.stock).toBe(stockAfterSale + 1);
  expect(o).toEqual({ status: "delivered", paymentStatus: "partially_refunded" }); // one of two kept
  expect(r).toEqual({ status: "refunded", amount: Math.round(item!.lineTotal / 2) });
  expect(notes.map((n) => n.status)).toEqual(["Requested", "Approved", "Received — refund in progress"]);

  await page.goto("/refunds");
  await expect(page.getByRole("row", { name: new RegExp(p.orderNumber) })).toContainText("processed");
});

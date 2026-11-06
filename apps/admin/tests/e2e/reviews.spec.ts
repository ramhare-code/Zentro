import { expect, test } from "@playwright/test";
import { advanceOrder, confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.setTimeout(120_000);

test("support moderates a flagged review; publishing recalculates the genuine rating", async ({ page }) => {
  const sql = db();
  const [v] = await sql<{ id: string; productId: string }[]>`select id, product_id as "productId" from shop.product_variants where sku = 'ZN-007-2'`;
  const p = await placeOrder(sql as never, {
    lines: [{ variantId: v!.id, quantity: 1 }], email: "farah@example.com", phone: "9123412345",
    address: { fullName: "Farah Khan", phone: "9123412345", line1: "9 Park Street", city: "Kolkata", stateCode: "WB", pincode: "700016" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, 'order_review_mod', ${p.totalPaise})`;
  await confirmPaidOrder(sql as never, { providerOrderId: "order_review_mod", providerPaymentId: "pay_review_mod", amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  for (const to of ["processing", "packed"] as const) await advanceOrder(sql as never, p.orderId, to, { actor: "operations" });
  await advanceOrder(sql as never, p.orderId, "shipped", { actor: "operations", shipment: { carrier: "India Post" } });
  await advanceOrder(sql as never, p.orderId, "delivered", { actor: "operations" });
  const [item] = await sql<{ id: string }[]>`select id from shop.order_items where order_id = ${p.orderId}`;
  await sql`insert into shop.reviews (product_id, order_item_id, display_name, rating, body, status, auto_flags)
            values (${v!.productId}, ${item!.id}, 'Farah K', 2, 'Lid leaks a little. Call me on 98765 43210 for details', 'pending', '{"contains a phone number"}')`;
  await sql.end();

  await acceptInvite(page, await createStaffInvite("mod@zentro.test", "Meena Mod", "support"));
  await page.goto("/reviews");
  const card = page.getByRole("listitem").filter({ hasText: "Lid leaks a little" });
  await expect(card).toContainText("Flagged: contains a phone number");
  await card.getByRole("button", { name: "Reject" }).click();
  await expect(card.locator('p[role="alert"]')).toContainText("Choose a rejection reason");
  await card.getByLabel("Rejection reason").selectOption("personal_information");
  await card.getByRole("button", { name: "Reject" }).click();
  await expect(card.getByRole("status")).toContainText("Rejected");

  await page.goto("/reviews?status=rejected");
  const rejected = page.getByRole("listitem").filter({ hasText: "Lid leaks a little" });
  await rejected.getByRole("button", { name: "Publish" }).click();
  await expect(rejected.getByRole("status")).toContainText("Published");

  const s2 = db();
  const [prod] = await s2<{ n: number; avg: string }[]>`select rating_count as n, rating_avg::text as avg from shop.products where id = ${v!.productId}`;
  const [log] = await s2<{ n: number }[]>`select count(*)::int as n from shop.audit_log where action in ('review.reject','review.publish')`;
  await s2.end();
  expect(prod).toEqual({ n: 1, avg: "2.00" });
  expect(log!.n).toBe(2);
});

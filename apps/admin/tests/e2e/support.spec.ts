import { expect, test } from "@playwright/test";
import { createTicket, ticketLink } from "@zentro/commerce/support";
import { confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { hashPasswordForTest } from "./test-utils";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
let ticketId = "";
let customerId = "";

test.beforeAll(async () => {
  const sql = db();
  const [c] = await sql<{ id: string }[]>`
    insert into shop.customers (email, email_verified_at, full_name, phone, password_hash)
    values ('lakshmi@example.com', now(), 'Lakshmi Iyer', '9443322110', ${await hashPasswordForTest()}) returning id`;
  customerId = c!.id;
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-005-2'`;
  const p = await placeOrder(sql as never, {
    lines: [{ variantId: v!.id, quantity: 1 }], email: "lakshmi@example.com", phone: "9443322110", userId: customerId,
    address: { fullName: "Lakshmi Iyer", phone: "9443322110", line1: "12 Besant Nagar", city: "Chennai", stateCode: "TN", pincode: "600090" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, 'order_sup', ${p.totalPaise})`;
  await confirmPaidOrder(sql as never, { providerOrderId: "order_sup", providerPaymentId: "pay_sup", amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  const t = await createTicket(sql as never, { name: "Lakshmi Iyer", email: "lakshmi@example.com", orderNumber: p.orderNumber, category: "order", subject: "Wrong colour sent", message: "I ordered Stone Grey but got Navy.", userId: customerId },
    (n) => ticketLink("http://shop.test", "e2e-ticket-secret", n));
  ticketId = t.id;
  await sql.end();
});

test("support agent replies, adds an internal note, assigns and resolves", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("agent@zentro.test", "Rohit Agent", "support"));
  await page.goto("/support");
  await page.getByRole("link", { name: "Wrong colour sent" }).click();
  await expect(page.getByText("I ordered Stone Grey but got Navy.")).toBeVisible();
  await expect(page.getByText(/l•+@example\.com/)).toBeVisible(); // support role sees masked contact

  const reply = page.locator("form", { has: page.getByRole("button", { name: "Send" }) });
  await reply.getByLabel("Reply").fill("Sorry about that! We’ll send the Stone Grey one today.");
  await reply.getByRole("button", { name: "Send" }).click();
  await expect(reply.getByRole("status")).toContainText("Reply sent to the customer");
  await reply.getByLabel("Reply").fill("Check warehouse pick list for SKU ZN-005-2.");
  await reply.getByLabel(/Internal note/).check();
  await reply.getByLabel("Then set status").selectOption("resolved");
  await reply.getByRole("button", { name: "Send" }).click();
  await expect(reply.getByRole("status")).toContainText("Internal note added");

  const side = page.locator("form", { has: page.getByRole("button", { name: "Update" }) });
  await side.getByLabel("Priority").selectOption("high");
  await side.getByLabel("Assigned to").selectOption({ label: "Rohit Agent" });
  await side.getByRole("button", { name: "Update" }).click();
  await expect(side.getByRole("status")).toContainText("Ticket updated");

  const sql = db();
  const [t] = await sql<{ status: string; priority: string; assigned: string | null }[]>`select status, priority, assigned_to::text as assigned from shop.support_tickets where id = ${ticketId}`;
  const mails = await sql<{ template: string; body: string }[]>`select template, payload->>'message' as body from shop.notification_outbox where recipient = 'lakshmi@example.com' and template like 'ticket_%' order by id`;
  await sql.end();
  expect(t!.status).toBe("resolved");
  expect(t!.priority).toBe("high");
  expect(t!.assigned).toBeTruthy();
  expect(mails.map((m) => m.template)).toEqual(["ticket_created", "ticket_reply"]); // internal note never emailed
  expect(mails[1]!.body).toContain("Stone Grey one today");
});

test("manager views a customer profile, restricts and restores, exports data, processes erasure", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("crm@zentro.test", "Pooja CRM", "manager"));
  await page.goto("/customers?q=lakshmi");
  await page.getByRole("link", { name: "Lakshmi Iyer" }).click();
  await expect(page.getByText("lakshmi@example.com (verified)")).toBeVisible(); // manager has customers.pii
  await expect(page.getByRole("link", { name: "Wrong colour sent" })).toBeVisible();

  const acct = page.locator("form", { has: page.getByRole("button", { name: "Sign out everywhere" }) });
  page.once("dialog", (d) => d.accept());
  await acct.getByRole("button", { name: "Restrict" }).click();
  await expect(acct.locator('p[role="alert"]')).toContainText("Record why");
  await acct.getByPlaceholder(/Reason/).fill("Chargeback fraud investigation");
  page.once("dialog", (d) => d.accept());
  await acct.getByRole("button", { name: "Restrict" }).click();
  await expect(acct.getByRole("status")).toContainText("restricted");
  await page.reload();
  await expect(page.getByText("Restricted: Chargeback fraud investigation")).toBeVisible();
  await page.locator("form", { has: page.getByRole("button", { name: "Restore" }) }).getByRole("button", { name: "Restore" }).click();

  const res = await page.request.get(`/api/customers/${customerId}/export`);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.customer.email).toBe("lakshmi@example.com");
  expect(data.orders).toHaveLength(1);
  expect(data.supportTickets[0].messages.length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(data.supportTickets)).not.toContain("warehouse pick list"); // internal notes excluded

  await page.reload();
  const erase = page.locator("form", { has: page.getByRole("button", { name: "Process erasure request" }) });
  await erase.getByLabel(/type DELETE/).fill("DELETE");
  page.once("dialog", (d) => d.accept());
  await erase.getByRole("button", { name: "Process erasure request" }).click();
  await expect(page).toHaveURL(/\/customers\?erased=1/);
  await expect(page.getByRole("status")).toContainText("Personal data erased");
  await expect(page.getByRole("link", { name: "Lakshmi Iyer" })).toHaveCount(0);
  const sql = db();
  const [c] = await sql<{ status: string; email: string }[]>`select status, email from shop.customers where id = ${customerId}`;
  const [o] = await sql<{ n: number }[]>`select count(*)::int as n from shop.orders where email = 'lakshmi@example.com' and user_id is null`;
  const [a] = await sql<{ n: number }[]>`select count(*)::int as n from shop.audit_log where action like 'customer.%'`;
  await sql.end();
  expect(c!.status).toBe("deleted");
  expect(c!.email).toMatch(/deleted\.invalid$/);
  expect(o!.n).toBe(1);
  expect(a!.n).toBeGreaterThanOrEqual(4);
});

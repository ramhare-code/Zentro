import { expect, test } from "@playwright/test";
import { formatPaise } from "@zentro/commerce";
import { applyRefundStatus, cancelOrder, confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

// Sales are dated to one isolated day so other tests' orders don't affect the totals.
const DAY = "2026-01-15";
const RANGE = `from=${DAY}&to=${DAY}`;
const COST = 30000; // ₹300 per unit
const FEE = 4000, FEE_GST = 610;
const exp = { netSales: 0, creditNet: 0, cogs: 0, profit: 0, intra: "", inter: "" };

test.beforeAll(async () => {
  const sql = db();
  await sql`update shop.product_variants set cost_paise = ${COST} where sku = 'ZN-007-1'`;
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-007-1'`;
  const make = async (key: string, qty: number, state: string, city: string, pincode: string) => {
    const placed = await placeOrder(sql as never, {
      lines: [{ variantId: v!.id, quantity: qty }], email: `${key}@example.com`, phone: "9123456780",
      address: { fullName: "Asha Menon", phone: "9123456780", line1: "4 Church Street", city, stateCode: state, pincode },
      idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
    });
    await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${placed.orderId}, ${"order_fin_" + key}, ${placed.totalPaise})`;
    const r = await confirmPaidOrder(sql as never, { providerOrderId: "order_fin_" + key, providerPaymentId: "pay_fin_" + key, amountPaise: placed.totalPaise, currency: "INR", status: "captured", method: "card" });
    expect(r.kind).toBe("confirmed");
    return placed;
  };
  const a = await make("a", 2, "KA", "Bengaluru", "560001"); // intra-state, kept
  const b = await make("b", 1, "TN", "Chennai", "600001");   // inter-state, cancelled after payment
  await sql`update shop.payments set fee_paise = ${FEE}, gateway_tax_paise = ${FEE_GST} where provider_order_id = 'order_fin_a'`;

  // B is cancelled and refunded → credit note
  const c = await cancelOrder(sql as never, b.orderId, { actor: "operations", reason: "Customer asked to cancel" });
  await applyRefundStatus(sql as never, c.refund!.refundId, "rfnd_fin_b", "processed");
  // A gets a duplicate payment refunded → money back, but no credit note and the order stays paid
  const [p2] = await sql<{ id: string }[]>`insert into shop.payments (order_id, provider_order_id, provider_payment_id, amount_paise, status) values (${a.orderId}, 'order_fin_a2', 'pay_fin_a2', ${a.totalPaise}, 'captured') returning id`;
  const [dup] = await sql<{ id: string }[]>`insert into shop.refunds (order_id, payment_id, amount_paise, reason) values (${a.orderId}, ${p2!.id}, ${a.totalPaise}, 'Duplicate payment') returning id`;
  await applyRefundStatus(sql as never, dup!.id, "rfnd_fin_dup", "processed");

  const ids = [a.orderId, b.orderId];
  await sql`update shop.invoices set issued_at = ${DAY + "T12:00:00+05:30"} where order_id in ${sql(ids)}`;
  await sql`update shop.credit_notes set issued_at = ${DAY + "T15:00:00+05:30"} where order_id in ${sql(ids)}`;
  await sql`update shop.payments set verified_at = ${DAY + "T12:00:00+05:30"} where order_id in ${sql(ids)}`;

  const o = await sql<{ id: string; total: number; tax: number; payment: string; status: string }[]>`select id, total_paise as total, tax_paise as tax, payment_status as payment, status from shop.orders where id in ${sql(ids)}`;
  const A = o.find((x) => x.id === a.orderId)!, B = o.find((x) => x.id === b.orderId)!;
  expect(A.payment).toBe("paid");
  expect(B).toMatchObject({ status: "cancelled", payment: "refunded" });
  const notes = await sql<{ number: string; total: number; gst: number; orderId: string }[]>`select credit_note_number as number, total_paise as total, cgst_paise + sgst_paise + igst_paise as gst, order_id as "orderId" from shop.credit_notes where order_id in ${sql(ids)}`;
  expect(notes).toHaveLength(1);
  expect(notes[0]!.orderId).toBe(b.orderId);
  expect(notes[0]!.number).toMatch(/^ZN\/CN\/\d{4}-\d{2}\/\d{6}$/);
  expect(notes[0]!.total).toBe(B.total);
  expect(notes[0]!.gst).toBe(B.tax);

  exp.netSales = A.total - A.tax + B.total - B.tax;
  exp.creditNet = B.total - B.tax;
  exp.cogs = 2 * COST; // B's unit came back to stock
  exp.profit = exp.netSales - exp.creditNet - exp.cogs - (FEE - FEE_GST);
  exp.intra = a.orderNumber; exp.inter = b.orderNumber;
  await sql.end();
});

test("finance sees profit, GST and registers; exports are permission-controlled", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("books@zentro.test", "Nisha Books", "finance"));
  await page.goto(`/finance?${RANGE}`);
  const pl = page.getByRole("region", { name: "Profit summary" });
  await expect(pl).toContainText("2 invoice(s), 1 credit note(s)");
  await expect(pl.getByText("Net sales", { exact: true }).locator("..").locator("dd")).toHaveText(formatPaise(exp.netSales));
  await expect(pl.getByText("Gross profit", { exact: true }).locator("..").locator("dd")).toHaveText(formatPaise(exp.profit));
  await expect(page.getByRole("region", { name: "Profit by product" })).toContainText("Modern Insulated Bottle");

  await page.getByRole("link", { name: "GST", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/finance/gst\\?from=${DAY}`));
  const states = page.getByRole("region", { name: "By place of supply (B2CS)" });
  await expect(states).toContainText("Karnataka (KA) · 18%");
  await expect(states.getByRole("row").filter({ hasText: "Tamil Nadu" })).toContainText("Inter-state0₹0₹0₹0₹0"); // invoiced then fully credited
  await expect(page.getByRole("region", { name: "HSN summary" })).toContainText("9617 · 18%");

  const inv = await page.request.get(`/api/finance/export?report=invoices&${RANGE}`);
  expect(inv.status()).toBe(200);
  const lines = (await inv.text()).trim().split("\r\n");
  expect(lines).toHaveLength(3);
  expect(lines.join("\n")).toContain(exp.intra);
  const cn = await (await page.request.get(`/api/finance/export?report=credit-notes&${RANGE}`)).text();
  expect(cn).toContain(exp.inter);
  expect(cn).toContain("Order cancelled");
  const profit = await (await page.request.get(`/api/finance/export?report=profit&${RANGE}`)).text();
  expect(profit).toContain(`TOTAL,2,${(exp.netSales / 100).toFixed(2)},${(exp.creditNet / 100).toFixed(2)},${(exp.cogs / 100).toFixed(2)}`);
  expect((await page.request.get(`/api/finance/export?report=nope&${RANGE}`)).status()).toBe(400);

  const sql = db();
  const [a] = await sql<{ n: number }[]>`select count(*)::int as n from shop.audit_log where action = 'finance.export'`;
  expect(a!.n).toBeGreaterThanOrEqual(3);
  await sql.end();
});

test("manager can view finance but not export; support can't open it", async ({ page, browser }) => {
  await acceptInvite(page, await createStaffInvite("mgr-fin@zentro.test", "Dev Manager", "manager"));
  await page.goto(`/finance?${RANGE}`);
  await expect(page.getByRole("region", { name: "Profit summary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  expect((await page.request.get(`/api/finance/export?report=invoices&${RANGE}`)).status()).toBe(403);

  const other = await browser.newPage();
  await acceptInvite(other, await createStaffInvite("care4@zentro.test", "Lina Care", "support"));
  await other.goto("/finance");
  await expect(other).toHaveURL(/\/forbidden/);
  await other.close();
});

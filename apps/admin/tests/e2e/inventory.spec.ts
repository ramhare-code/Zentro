import { expect, test, type Page } from "@playwright/test";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const form = (page: Page, button: string) => page.locator("form", { has: page.getByRole("button", { name: button, exact: true }) });
const stockOf = async (sku: string) => { const sql = db(); try { return (await sql<{ stock: number; cost: number | null }[]>`select stock, cost_paise as cost from shop.product_variants where sku = ${sku}`)[0]!; } finally { await sql.end(); } };

test("suppliers, purchase orders with partial receipt, and a stock count reconcile stock", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("stock@zentro.test", "Ravi Stock", "inventory"));
  const start1 = (await stockOf("ZN-001-1")).stock, start2 = (await stockOf("ZN-001-2")).stock;

  // supplier
  await page.goto("/suppliers");
  const add = form(page, "Add supplier");
  await add.getByLabel("Name").fill("Lakshmi Traders");
  await add.getByLabel("GSTIN").fill("29ABC");
  await add.getByRole("button", { name: "Add supplier" }).click();
  await expect(add.locator('p[role="alert"]')).toContainText("GSTIN should be 15 characters");
  await add.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
  await add.getByLabel("Lead time (days)").fill("7");
  await add.getByRole("button", { name: "Add supplier" }).click();
  await expect(add.getByRole("status")).toContainText("Supplier added");
  await page.reload();
  await expect(page.getByText("Lakshmi Traders")).toBeVisible();

  // purchase order: bad SKU is reported and the typed lines are kept
  await page.goto("/purchase-orders/new");
  await page.getByLabel("Supplier").selectOption({ label: "Lakshmi Traders" });
  await page.getByLabel("Expected delivery").fill("2020-01-15");
  await page.getByLabel(/^Lines/).fill("ZN-001-1, 10, 450\nNOPE-1, 2, 10");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("no variant with SKU NOPE-1");
  await page.getByLabel(/^Lines/).fill("zn-001-1, 10, 450\nZN-001-2, 4, 1,299.50");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/purchase-orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^PO-\d+$/);
  const poNumber = (await page.getByRole("heading", { level: 1 }).textContent())!;
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Receive ZN-001-1" })).toHaveCount(0); // drafts can't be received

  const status = form(page, "Mark as ordered");
  await status.getByRole("button", { name: "Mark as ordered" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked as ordered" })).toBeVisible();
  await page.reload();

  // partial receipt
  const recv = form(page, "Receive stock");
  await recv.getByLabel("Receive ZN-001-1").fill("6");
  await recv.getByLabel("Delivery note / invoice no. (optional)").fill("INV-778");
  await recv.getByRole("button", { name: "Receive stock" }).click();
  await expect(recv.getByRole("status")).toContainText(`Received 6 unit(s) against ${poNumber}. Some items are still expected.`);
  expect(await stockOf("ZN-001-1")).toEqual({ stock: start1 + 6, cost: 45000 });

  // over-receipt refused; nothing changes
  await page.reload();
  await recv.getByLabel("Receive ZN-001-1").fill("5");
  await recv.getByLabel("Receive ZN-001-2").fill("4");
  await recv.getByRole("button", { name: "Receive stock" }).click();
  await expect(recv.locator('p[role="alert"]')).toContainText("ZN-001-1: only 4 still expected");
  expect((await stockOf("ZN-001-2")).stock).toBe(start2);

  await recv.getByLabel("Receive ZN-001-1").fill("4");
  await recv.getByRole("button", { name: "Receive stock" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Purchase order complete" })).toBeVisible();
  expect(await stockOf("ZN-001-1")).toEqual({ stock: start1 + 10, cost: 45000 });
  expect(await stockOf("ZN-001-2")).toEqual({ stock: start2 + 4, cost: 129950 });
  const q = db();
  expect((await q`select status from shop.purchase_orders where po_number = ${poNumber}`)[0]!.status).toBe("received");
  await q.end();

  // movements reference the PO
  await page.goto(`/inventory/movements?q=${poNumber}`);
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("tbody").filter({ hasText: "INV-778" }).first()).toBeVisible();
  await expect(page.locator("tbody").filter({ hasText: "Ravi Stock" }).first()).toBeVisible();

  // inventory dashboard shows cost and value
  await page.goto("/inventory?q=ZN-001-2");
  const row = page.locator("tbody tr", { hasText: "ZN-001-2" });
  await expect(row).toContainText("₹1,299.50");
  const csv = await page.request.get("/api/inventory/export?q=ZN-001");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toMatch(/ZN-001-2,.*,1299\.50,/);

  // stock count: a sale happens between the snapshot and applying
  await page.goto("/inventory/counts");
  const startForm = form(page, "Start count");
  await startForm.getByLabel("Title").fill("Shelf A count");
  await startForm.getByRole("button", { name: "Start count" }).click();
  await expect(page).toHaveURL(/\/inventory\/counts\/[0-9a-f-]{36}$/);
  const save = form(page, "Save counts");
  await save.getByLabel("Counted ZN-001-1").fill(String(start1 + 10 - 3)); // 3 missing on the shelf
  await save.getByLabel("Counted ZN-001-2").fill(String(start2 + 4));      // matches
  await save.getByRole("button", { name: "Save counts" }).click();
  await expect(save.getByRole("status")).toContainText("Counts saved");

  const sql = db();
  await sql`update shop.product_variants set stock = stock - 2 where sku = 'ZN-001-1'`; // a customer bought 2 meanwhile
  await sql.end();

  page.once("dialog", (d) => d.accept());
  const apply = form(page, "Apply count");
  await apply.getByRole("button", { name: "Apply count" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Applied: 1 variant(s) corrected (3 unit(s))" })).toBeVisible();
  expect((await stockOf("ZN-001-1")).stock).toBe(start1 + 10 - 2 - 3);
  expect((await stockOf("ZN-001-2")).stock).toBe(start2 + 4);

  await page.goto("/inventory/movements?reason=reconciliation");
  await expect(page.locator("tbody tr").first()).toContainText("-3");
  await expect(page.locator("tbody tr").first()).toContainText("Shelf A count");
});

test("support staff cannot see inventory pages or the export", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("care2@zentro.test", "Asha Care", "support"));
  for (const p of ["/inventory", "/suppliers", "/purchase-orders/new"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/forbidden/);
  }
  expect((await page.request.get("/api/inventory/export")).status()).toBe(403);
});

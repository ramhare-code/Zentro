import { expect, test } from "@playwright/test";
import { formatPaise } from "@zentro/commerce";
import { confirmPaidOrder, placeOrder, quote } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";

const SHOP = "http://localhost:3202";
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.afterAll(async () => {
  // leave the shared test database as other specs expect it
  const sql = db();
  await sql`update shop.store_settings set business_name = null, legal_name = null, address = null, gstin = null, state_code = null,
            support_email = null, support_phone = null, return_window_days = null, shipping_gst_mode = 'none' where id`;
  await sql`delete from shop.shipping_rates where name = 'Chennai express'`;
  await sql`delete from shop.unserviceable_pincodes where pincode = '600099'`;
  await sql.end();
});

test("owner sets business details, shipping rules and GST on shipping; invoices keep what they were issued with", async ({ page, browser }) => {
  await acceptInvite(page, await createStaffInvite("owner2@zentro.test", "Rohan Owner", "owner"));

  // ---- business details
  await page.goto("/settings");
  await expect(page.getByText(/Before launch, add: legal name, registered address, GSTIN/)).toBeVisible();
  await page.getByLabel("Registered legal name").fill("Zentro Retail Private Limited");
  await page.getByLabel("Registered address").fill("12 MG Road, Bengaluru 560001, Karnataka");
  await page.getByLabel("GSTIN").fill("27AAPFU0939F1ZV");
  await page.getByLabel("State of GST registration").selectOption("KA");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("registered in another state (code 27), not KA");
  await page.getByLabel("GSTIN").fill("29AAGCB7383J1Z5");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("check digit");
  await page.getByLabel("GSTIN").fill("29AAGCB7383J1Z4");
  await page.getByLabel("Support email").fill("care@zentro.test");
  await page.getByLabel("Return window (days)").fill("10");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  const shop = await browser.newPage();
  await shop.goto(`${SHOP}/contact`);
  await expect(shop.getByRole("link", { name: "care@zentro.test" }).first()).toBeVisible();
  await expect(shop.getByText("Zentro Retail Private Limited").first()).toBeVisible();

  // ---- shipping: a cheaper local rate, a blocked pincode, and the coverage check
  await page.goto("/settings/shipping");
  const add = page.getByRole("region", { name: "Add a rate" });
  await add.getByLabel("Name").fill("Chennai express");
  await add.getByLabel("Delivery charge ₹").fill("29");
  await add.getByLabel(/^Priority/).fill("1");
  await add.getByLabel("Days from").fill("1");
  await add.getByLabel("to", { exact: true }).fill("2");
  await add.locator("select[name=stateCodes]").selectOption("TN");
  await add.getByLabel(/^Pincode prefixes/).fill("600");
  await add.getByRole("button", { name: "Add rate" }).click();
  await expect(add.getByRole("status")).toContainText("Shipping rate saved");
  await page.goto("/settings/shipping?state=TN&pin=600001&sub=300");
  await expect(page.getByRole("form", { name: "Coverage check" }).getByRole("status")).toHaveText("“Chennai express”: ₹29, 1–2 days.");
  const pins = page.getByRole("region", { name: /Pincodes you don’t deliver to/ });
  await pins.getByLabel("Pincodes").fill("600099");
  await pins.getByRole("button", { name: "Block", exact: true }).click();
  await expect(pins.getByRole("status")).toContainText("1 pincode(s) blocked");
  await page.goto("/settings/shipping?state=TN&pin=600099&sub=300");
  await expect(page.getByRole("form", { name: "Coverage check" }).getByRole("status")).toContainText("Blocked");

  const sql = db();
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-007-2'`;
  const base = { lines: [{ variantId: v!.id, quantity: 1 }], email: "tax@example.com", sellerStateCode: "KA" };
  await expect(quote(sql as never, { ...base, stateCode: "TN", pincode: "600099" })).rejects.toThrow("don’t deliver to this pincode");
  const local = await quote(sql as never, { ...base, stateCode: "TN", pincode: "600001" });
  expect(local.shippingPaise).toBe(2900);
  expect(local.shippingTax.taxablePaise).toBe(0); // GST on shipping is off by default

  // ---- GST on shipping (composite supply at the highest item rate)
  await page.goto("/settings/tax");
  await page.getByLabel(/Shipping is part of the sale/).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "New orders include GST on shipping" })).toBeVisible();
  const taxed = await quote(sql as never, { ...base, stateCode: "TN", pincode: "600001" });
  expect(taxed.totalPaise).toBe(local.totalPaise); // the customer pays the same
  expect(taxed.shippingTax).toEqual({ gstRate: 18, taxablePaise: 2458, cgstPaise: 0, sgstPaise: 0, igstPaise: 442 });
  expect(taxed.taxPaise).toBe(local.taxPaise + 442);

  const placed = await placeOrder(sql as never, {
    ...base, phone: "9123456780", idempotencyKey: crypto.randomUUID(), whatsappUpdates: false,
    address: { fullName: "Lakshmi Iyer", phone: "9123456780", line1: "3 Beach Road", city: "Chennai", stateCode: "TN", pincode: "600001" },
  });
  await sql`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${placed.orderId}, 'order_settings_1', ${placed.totalPaise})`;
  expect((await confirmPaidOrder(sql as never, { providerOrderId: "order_settings_1", providerPaymentId: "pay_settings_1", amountPaise: placed.totalPaise, currency: "INR", status: "captured", method: "upi" })).kind).toBe("confirmed");

  await shop.goto(`${SHOP}/order/${placed.orderNumber}/invoice?t=${placed.guestToken}`);
  await expect(shop.getByRole("heading", { name: "Tax Invoice" })).toBeVisible();
  const invoice = shop.locator("article");
  await expect(invoice.getByText("GSTIN 29AAGCB7383J1Z4", { exact: true })).toBeVisible();
  await expect(invoice.getByText("incl. GST 18% on delivery")).toBeVisible();
  await expect(invoice.getByText(formatPaise(442), { exact: true })).toBeVisible();

  // renaming the business later doesn't rewrite an issued invoice
  await page.goto("/settings");
  await page.getByLabel("Registered legal name").fill("Zentro Commerce LLP");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await shop.reload();
  await expect(shop.locator("article").getByText("Zentro Retail Private Limited")).toBeVisible();
  await expect(shop.locator("article").getByText("Zentro Commerce LLP")).toHaveCount(0);

  // the GST report includes the shipping tax
  await page.goto("/finance/gst?range=7d");
  await expect(page.getByRole("region", { name: "HSN summary" })).toContainText("Shipping (with goods) · 18%");

  // ---- HSN bulk editing
  await sql`update shop.products set hsn_code = null where slug = 'compact-travel-organizer'`;
  await page.goto("/settings/tax?missing=1");
  await expect(page.getByText(/1 of \d+ products have no HSN code/)).toBeVisible();
  await page.getByLabel("HSN for Compact Travel Organizer").fill("42029");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("4, 6 or 8 digits");
  await page.getByLabel("HSN for Compact Travel Organizer").fill("420292");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Updated 1 product(s)" })).toBeVisible();
  const [p] = await sql<{ hsn: string }[]>`select hsn_code as hsn from shop.products where slug = 'compact-travel-organizer'`;
  expect(p!.hsn).toBe("420292");
  await shop.close();
  await sql.end();
});

test("finance staff can manage tax but not store settings", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("tax2@zentro.test", "Gita Finance", "finance"));
  await page.goto("/settings/tax");
  await expect(page.getByRole("heading", { name: "Tax", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link")).toHaveCount(1);
  for (const p of ["/settings", "/settings/shipping"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/forbidden/);
  }
});

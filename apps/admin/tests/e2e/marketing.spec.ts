import { expect, test, type Page } from "@playwright/test";
import { formatPaise } from "@zentro/commerce";
import { placeOrder, quote } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";
import { makePng } from "./png";

const SHOP = "http://localhost:3202";
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const form = (page: Page, button: string) => page.locator("form", { has: page.getByRole("button", { name: button, exact: true }) });
const SALE = 249900 - Math.floor((249900 * 20) / 100); // 20% off ₹2,499

async function fillAddress(page: Page) {
  await page.getByRole("textbox", { name: "Email" }).fill("ravi@example.com");
  await page.getByLabel("Full name").fill("Ravi Kumar");
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByLabel("Flat / house no., building, street").fill("8, 2nd Main, Jayanagar");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByLabel("Pincode").fill("560041");
  await page.getByLabel("State").selectOption({ label: "Karnataka" });
}

test("manager runs a promotion, a coupon and banners, and the storefront follows", async ({ page, browser }) => {
  const sql = db();
  await sql`update shop.product_variants set cost_paise = 210000 where sku = 'ZN-002-1'`;
  const [watch] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-002-1'`;
  await acceptInvite(page, await createStaffInvite("promo@zentro.test", "Tara Marketing", "manager"));

  // ---- promotion: refused while it would sell below cost, then confirmed
  await page.goto("/promotions/new");
  await page.getByLabel("Name (internal)").fill("Watch week");
  await page.getByLabel("Badge customers see").fill("Watch Week");
  await page.getByLabel("Discount (% or ₹)").fill("20");
  await page.getByLabel("Starts (IST)").fill("2026-01-01T00:00");
  await page.getByLabel("Ends (IST)").fill("2026-06-30T23:00");
  await page.getByLabel("Specific products").check();
  await page.getByLabel("Product slugs").fill("smart-fitness-watch");
  await page.getByRole("button", { name: "Create promotion" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Promotions can run for up to 92 days");
  const now = Date.now();
  const ist = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 16);
  await page.getByLabel("Starts (IST)").fill(ist(now - 3600_000));
  await page.getByLabel("Ends (IST)").fill(ist(now + 7 * 86_400_000));
  await page.getByRole("button", { name: "Create promotion" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("would sell below their cost price (ZN-002-1");
  await page.getByLabel("Allow selling below cost price").check();
  await page.getByRole("button", { name: "Create promotion" }).click();
  await expect(page).toHaveURL(/\/promotions\/[0-9a-f-]{36}\?created=1/);
  await expect(page.getByText("It’s live now.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Items covered" })).toContainText("below cost");

  const shop = await browser.newPage();
  await shop.goto(`${SHOP}/p/smart-fitness-watch`);
  await expect(shop.getByText("Watch Week").first()).toBeVisible();
  await expect(shop.getByText(formatPaise(SALE)).first()).toBeVisible();
  await shop.goto(`${SHOP}/c/wearables`);
  await expect(shop.locator("article", { hasText: "Smart Fitness Watch" })).toContainText("Watch Week");

  // ---- coupon limited to Wearables, not combinable with sale prices, listed at checkout
  await page.goto("/coupons/new");
  await page.getByLabel("Code").fill("watch5");
  await page.getByLabel("Shown to customers").fill("5% off wearables");
  await page.getByLabel("Discount (% or ₹)").fill("5");
  await page.getByLabel("Categories (incl. subcategories)").check();
  await page.locator("select[name=categoryIds]").selectOption({ label: "Electronics › Wearables" });
  await page.getByLabel("Also applies to items already on sale").uncheck();
  await page.getByLabel("Show as an offer at checkout").check();
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page).toHaveURL(/\/coupons\/[0-9a-f-]{36}\?created=1/);
  const couponUrl = page.url().split("?")[0]!;

  await shop.goto(`${SHOP}/checkout?buy=${watch!.id}&qty=1`);
  await fillAddress(shop);
  const offers = shop.getByRole("list", { name: "Available offers" });
  await expect(offers).toContainText("WATCH5");
  await offers.getByRole("button", { name: "Apply WATCH5" }).click();
  await expect(shop.getByText("This coupon can’t be combined with items already on sale.")).toBeVisible();

  await page.goto(couponUrl);
  await page.getByLabel("Also applies to items already on sale").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Coupon saved" })).toBeVisible();
  await shop.reload();
  await fillAddress(shop);
  await shop.getByRole("list", { name: "Available offers" }).getByRole("button", { name: "Apply WATCH5" }).click();
  await expect(shop.getByText("WATCH5 applied.")).toBeVisible();
  await expect(shop.getByText(`−${formatPaise(Math.floor((SALE * 5) / 100))}`)).toBeVisible();

  // ---- banners: one on the Wearables page, one on the homepage
  await page.goto("/banners/new");
  await page.getByLabel("Headline").fill("Track every step");
  await page.getByLabel("Button text").fill("Shop watches");
  await page.getByLabel("Button link").fill("https://evil.example/");
  await page.getByLabel("Upload image").setInputFiles({ name: "watch.png", mimeType: "image/png", buffer: makePng(1600, 600) });
  await page.getByLabel("Alt text").fill("Fitness watch on a running track");
  await page.getByLabel("Where").selectOption("category");
  await page.getByLabel(/^Category/).selectOption({ label: "Electronics › Wearables" });
  await page.getByRole("button", { name: "Create banner" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("must be a page on your store");
  await page.getByLabel("Button link").fill("/p/smart-fitness-watch");
  await page.getByLabel("Upload image").setInputFiles({ name: "watch.png", mimeType: "image/png", buffer: makePng(1600, 600) });
  await page.getByRole("button", { name: "Create banner" }).click();
  await expect(page).toHaveURL(/\/banners\/[0-9a-f-]{36}\?created=1/);
  await shop.goto(`${SHOP}/c/wearables`);
  await expect(shop.getByRole("link", { name: "Track every step — Shop watches" })).toHaveAttribute("href", "/p/smart-fitness-watch");

  await page.goto("/banners/new");
  await page.getByLabel("Headline").fill("Festive picks are here");
  await page.getByLabel("Upload image").setInputFiles({ name: "home.png", mimeType: "image/png", buffer: makePng(1600, 600) });
  await page.getByLabel("Alt text").fill("Gift boxes with lights");
  await page.getByRole("button", { name: "Create banner" }).click();
  await expect(page).toHaveURL(/\/banners\/[0-9a-f-]{36}\?created=1/);
  await shop.goto(SHOP);
  await expect(shop.getByText("Festive picks are here").first()).toBeAttached();

  // ---- ending the promotion restores the normal price everywhere
  await page.goto("/promotions");
  await page.getByRole("link", { name: "Watch week" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "End promotion" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Promotion ended" })).toBeVisible();
  await shop.goto(`${SHOP}/p/smart-fitness-watch`);
  await expect(shop.getByText(formatPaise(249900)).first()).toBeVisible();
  await expect(shop.getByText("Watch Week")).toHaveCount(0);
  await shop.close();

  const acts = await sql<{ action: string }[]>`select distinct action from shop.audit_log where action like any(array['promotion.%','coupon.%','banner.%']) order by 1`;
  expect(acts.map((a) => a.action)).toEqual(["banner.create", "coupon.create", "coupon.update", "promotion.create", "promotion.end"]);
  await sql.end();
});

test("a coupon with one use left is held by an unpaid checkout, and released when it expires", async () => {
  const sql = db();
  await sql`insert into shop.coupons (code, description, discount_type, discount_value, usage_limit) values ('ONEUSE', 'Just one', 'fixed', 10000, 1)`;
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-008-1' or sku = 'ZN-006-1' order by stock desc limit 1`;
  const base = { lines: [{ variantId: v!.id, quantity: 1 }], couponCode: "ONEUSE", sellerStateCode: "KA", stateCode: "KA", pincode: "560001" };
  const first = await placeOrder(sql as never, {
    ...base, email: "first@example.com", phone: "9123456780", idempotencyKey: crypto.randomUUID(), whatsappUpdates: false,
    address: { fullName: "First Buyer", phone: "9123456780", line1: "1 Main Road", city: "Bengaluru", stateCode: "KA", pincode: "560001" },
  });
  const held = await quote(sql as never, { ...base, email: "second@example.com" });
  expect(held.couponId).toBeNull();
  expect(held.couponMessage).toBe("This coupon has been fully redeemed.");
  await sql`update shop.orders set reservation_expires_at = now() - interval '1 minute' where id = ${first.orderId}`;
  const freed = await quote(sql as never, { ...base, email: "second@example.com" });
  expect(freed.couponMessage).toBe("ONEUSE applied.");
  expect(freed.discountPaise).toBe(10000);
  await sql.end();
});

test("inventory staff can't manage marketing", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("stock2@zentro.test", "Om Stock", "inventory"));
  for (const p of ["/coupons", "/promotions/new", "/banners"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/forbidden/);
  }
});

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { advanceOrder, confirmPaidOrder, placeOrder } from "@zentro/commerce/orders";
import { E2E_DB } from "../../playwright.config";

const sql = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.addInitScript(() => { document.cookie = "zentro_consent=essential; path=/"; try { sessionStorage.setItem("zentro-intro", "1"); } catch {} });
});

/** Delivered order for one variant, then a published review on it (as the storefront would create). */
async function reviewed(sku: string, name: string, rating: number, title: string, body: string) {
  const s = sql();
  const [v] = await s<{ id: string; productId: string }[]>`select id, product_id as "productId" from shop.product_variants where sku = ${sku}`;
  const p = await placeOrder(s as never, {
    lines: [{ variantId: v!.id, quantity: 1 }], email: "rev@example.com", phone: "9988776655",
    address: { fullName: name, phone: "9988776655", line1: "4 Marine Drive", city: "Kochi", stateCode: "KL", pincode: "682001" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  const rzp = `order_rv_${p.orderNumber}`;
  await s`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, ${rzp}, ${p.totalPaise})`;
  await confirmPaidOrder(s as never, { providerOrderId: rzp, providerPaymentId: `pay_${rzp}`, amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  for (const to of ["processing", "packed"] as const) await advanceOrder(s as never, p.orderId, to, { actor: "operations" });
  await advanceOrder(s as never, p.orderId, "shipped", { actor: "operations", shipment: { carrier: "Blue Dart" } });
  await advanceOrder(s as never, p.orderId, "delivered", { actor: "operations" });
  const [item] = await s<{ id: string }[]>`select id from shop.order_items where order_id = ${p.orderId}`;
  const [r] = await s<{ id: string }[]>`insert into shop.reviews (product_id, order_item_id, display_name, rating, title, body, status)
    values (${v!.productId}, ${item!.id}, ${name}, ${rating}, ${title}, ${body}, 'published') returning id`;
  await s.end();
  return r!.id;
}

async function register(page: Page, email: string) {
  await page.goto("/account/register");
  await page.getByLabel("Full name").fill("Vikram Rao");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("coconut-rain-harbour-3");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account\?welcome=1/);
}

let lowId = "";

test("product page shows rich details, rating summary, variant bought and store reply", async ({ page }) => {
  await reviewed("ZN-005-1", "Asha N", 5, "Fits my laptop perfectly", "Roomy and comfortable on long walks.");
  await reviewed("ZN-005-2", "Dev P", 4, "Good everyday bag", "Plenty of pockets.");
  lowId = await reviewed("ZN-005-1", "Sunil K", 1, "Zip broke", "The main zip broke in a week.");
  const s = sql();
  await s`update shop.reviews set seller_reply = 'Sorry Sunil, a replacement is on its way.', seller_replied_at = now() where id = ${lowId}`;
  await s`update shop.products set box_contents = '{"Backpack","Rain cover"}', warranty = '6 months', country_of_origin = 'India',
          brand_story = '[{"title":"Room for everything","body":"Separate **laptop** sleeve.","mediaUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","mediaKind":"youtube"}]'
          where slug = 'premium-everyday-backpack'`;
  await s.end();

  await page.goto("/p/premium-everyday-backpack");
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Reviews (3)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What’s in the box" })).toBeVisible();
  await expect(page.getByText("Rain cover")).toBeVisible();
  await expect(page.getByText("Country of origin")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Room for everything" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play video: Room for everything" })).toBeVisible();
  await expect(page.getByText("3 verified ratings")).toBeVisible();
  await expect(page.getByText("Response from Zentro")).toBeVisible();
  await expect(page.getByText("Stone Grey").first()).toBeVisible();
  // the YouTube player only loads after tapping play, and uses the privacy-enhanced domain
  await page.getByRole("button", { name: "Play video: Room for everything" }).click();
  await expect(page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toBeVisible();
});

test("all-reviews page filters by stars and sorts", async ({ page }) => {
  await page.goto("/p/premium-everyday-backpack/reviews");
  await expect(page.getByText("Showing 1–3 of 3 reviews")).toBeVisible();
  await page.getByRole("link", { name: "1 ★ (1)" }).click();
  await expect(page).toHaveURL(/rating=1/);
  await expect(page.getByText("Showing 1–1 of 1 review")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zip broke" })).toBeVisible();
  await page.getByRole("link", { name: "All", exact: true }).click();
  await page.getByLabel("Sort by").selectOption("lowest");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/sort=lowest/);
  await expect(page.locator("article h3").first()).toHaveText("Zip broke");
});

test("helpful needs sign-in, toggles once per customer; three reports hide a review for moderation", async ({ page }) => {
  await page.goto("/p/premium-everyday-backpack/reviews?sort=lowest");
  const card = page.locator(`#review-${lowId}`);
  await card.getByRole("button", { name: "Helpful" }).click();
  await expect(page).toHaveURL(/\/account\/login\?next=/);

  await register(page, `voter-${Date.now()}@example.com`);
  await page.goto("/p/premium-everyday-backpack/reviews?sort=lowest");
  await card.getByRole("button", { name: "Helpful" }).click();
  await expect(card.getByText("1 person found this helpful")).toBeVisible();
  await expect(card.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Helpful" }).click();
  await expect(card.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "false");

  const s = sql();
  await s`insert into shop.review_reports (review_id, reporter, reason) values (${lowId}, 'c:other-1', 'spam'), (${lowId}, 'c:other-2', 'fake')`;
  await s.end();
  await card.getByRole("button", { name: "Report" }).click();
  await card.getByLabel("Not about this product").check();
  await card.getByRole("button", { name: "Send report" }).click();
  // the third report hides it straight away, so it disappears from the page
  await expect(card).toHaveCount(0);

  const s2 = sql();
  const [r] = await s2<{ status: string; reports: number; flags: string[]; helpful: number }[]>`
    select status, report_count as reports, auto_flags as flags, helpful_count as helpful from shop.reviews where id = ${lowId}`;
  await s2.end();
  expect(r).toEqual({ status: "pending", reports: 3, flags: ["reported by customers"], helpful: 0 });
  await page.goto("/p/premium-everyday-backpack/reviews");
  await expect(page.getByText("Showing 1–2 of 2 reviews")).toBeVisible();
});

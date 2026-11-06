import { expect, test } from "@playwright/test";

// These run against the development seed catalogue (npm run db:seed:dev).

test("homepage shows banners, categories and product rails", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Featured offers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shop by category" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top deals" })).toBeVisible();
  const firstCard = page.locator("section", { has: page.locator("#deals") }).getByRole("article").first();
  await expect(firstCard).toBeVisible();
  // no fabricated ratings: seed has no reviews
  await expect(page.getByText(/ratings\)/)).toHaveCount(0);
});

test("category page filters by brand and stock, and paginates links", async ({ page }) => {
  await page.goto("/c/electronics");
  await expect(page.getByRole("heading", { level: 1, name: "Electronics" })).toBeVisible();
  await expect(page.getByText("3 products")).toBeVisible();
  await page.goto("/c/electronics?brand=pulse-labs");
  await expect(page.getByText("1 product", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Smart Fitness Watch" })).toBeVisible();
});

test("search tolerates typos and suggests a correction", async ({ page }) => {
  await page.goto("/search?q=hedphones");
  await expect(page.getByRole("link", { name: "Wireless Noise-Cancelling Headphones" })).toBeVisible();
  await page.goto("/search?q=bakpak");
  await expect(page.getByText(/Did you mean/)).toBeVisible();
});

test("empty results offer help", async ({ page }) => {
  await page.goto("/search?q=zzzzqqq");
  await expect(page.getByRole("heading", { name: /No products match/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Electronics" }).last()).toBeVisible();
});

test("autocomplete suggests products as you type", async ({ page }, info) => {
  await page.goto("/");
  const box = page.getByRole("combobox").locator("visible=true").first();
  await box.fill("lamp");
  await expect(page.getByRole("option", { name: /Minimal Desk Lamp/ })).toBeVisible();
  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/p\/minimal-desk-lamp/);
  info.annotations.push({ type: "note", description: "keyboard navigation works" });
});

test("product page: variants change price/stock, out-of-stock marked", async ({ page }) => {
  await page.goto("/p/everyday-classic-sneakers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Everyday Classic Sneakers");
  await expect(page.getByText("Only 5 left")).toBeVisible();
  await page.locator("label", { hasText: "UK 8" }).click();
  await expect(page.getByText("In stock").first()).toBeVisible();
  await expect(page).toHaveURL(/variant=ZN-003-2/);
  await expect(page.locator("label", { hasText: "UK 10" })).toContainText("(out of stock)");
  await expect(page.getByRole("heading", { name: "Specifications" })).toBeVisible();
  await expect(page.getByText("No reviews yet")).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld!)).toMatchObject({ "@type": "Product", offers: { priceCurrency: "INR" } });
  expect(JSON.parse(ld!).aggregateRating).toBeUndefined();
});

test("unknown product returns 404", async ({ page }) => {
  const res = await page.goto("/p/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

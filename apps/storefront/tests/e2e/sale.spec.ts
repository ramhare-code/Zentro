import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";

const sql = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { document.cookie = "zentro_consent=essential; path=/"; try { sessionStorage.setItem("zentro-intro", "1"); } catch {} });
});

test("festive sale: strip, countdown, sale page and badges appear while it runs and vanish after", async ({ page }) => {
  const s = sql();
  const [promo] = await s<{ id: string }[]>`
    insert into shop.promotions (name, badge, discount_type, discount_value, applies_to, category_ids, starts_at, ends_at)
    values ('Diwali Dhamaka Days', 'Diwali Dhamaka', 'percent', 25, 'categories', array[(select id from shop.categories where slug = 'lighting')], now() - interval '1 minute', now() + interval '3 days')
    returning id`;
  await s.end();
  try {
    await page.goto("/");
    const strip = page.getByRole("link", { name: /Diwali Dhamaka Days/ }).first();
    await expect(strip).toBeVisible();
    await expect(page.getByRole("timer").first()).toHaveAttribute("aria-label", /Ends in [23] days/);
    await expect(page.getByRole("heading", { name: "Diwali Dhamaka Days" })).toBeVisible();
    await expect(page.getByText("Up to 25% off across the store")).toBeVisible();

    await page.getByRole("link", { name: "Shop the sale" }).click();
    await expect(page).toHaveURL(/\/sale$/);
    await expect(page.getByRole("heading", { level: 1, name: "Diwali Dhamaka Days" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "1 deal" })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: "Minimal Desk Lamp" });
    await expect(card).toContainText("Diwali Dhamaka");
    await expect(card).toContainText("₹974.25");
  } finally {
    const s2 = sql();
    await s2`update shop.promotions set is_active = false where id = ${promo!.id}`;
    await s2.end();
  }
  await page.goto("/sale");
  await expect(page.getByRole("heading", { name: "No sale running right now" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);
});

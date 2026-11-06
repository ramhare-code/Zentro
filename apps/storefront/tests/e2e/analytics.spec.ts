import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { E2E_DB as DB } from "../../playwright.config";

async function events(since: Date) {
  const sql = postgres(DB, { max: 1, onnotice: () => {} });
  const rows = await sql<{ event: string; visitorId: string | null; path: string }[]>`
    select event, visitor_id as "visitorId", path from shop.analytics_events where occurred_at >= ${since} order by id`;
  await sql.end();
  return rows;
}

test.describe.configure({ mode: "serial" });

test("declining analytics records only anonymous page views", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const since = new Date(Date.now() - 1000);
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Help us improve Zentro" })).toBeVisible();
  await page.getByRole("button", { name: "Essential only" }).click();
  await expect(page.getByRole("dialog", { name: "Help us improve Zentro" })).toHaveCount(0);
  await page.goto("/c/audio");
  await page.waitForTimeout(500);
  const rows = await events(since);
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows.every((r) => r.visitorId === null)).toBe(true);
  expect((await page.context().cookies()).find((c) => c.name === "zentro_vid")).toBeUndefined();
});

test("accepting analytics records visitor, session and product views", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const since = new Date(Date.now() - 1000);
  await page.goto("/");
  await page.getByRole("button", { name: "Allow analytics" }).click();
  await page.getByRole("link", { name: "Minimal Desk Lamp" }).first().click();
  await expect(page).toHaveURL(/minimal-desk-lamp/);
  await page.waitForTimeout(700);
  const rows = await events(since);
  const pv = rows.find((r) => r.event === "product_view");
  expect(pv?.visitorId).toMatch(/^[0-9a-f-]{36}$/);
  expect(rows.filter((r) => r.event === "page_view" && r.visitorId).length).toBeGreaterThanOrEqual(1);
});

test("beacon rejects junk and bots", async ({ request }) => {
  expect((await request.post("/api/t", { data: { event: "drop table", path: "/" } })).status()).toBe(400);
  expect((await request.post("/api/t", { data: { event: "page_view", path: "/", visitorId: "x" } })).status()).toBe(400);
  expect((await request.post("/api/t", { data: { event: "page_view", path: "/" }, headers: { "user-agent": "Googlebot/2.1" } })).status()).toBe(204);
});

import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { unsubscribeLink } from "@zentro/commerce/messaging";
import { E2E_DB } from "../../playwright.config";

test("one-click unsubscribe withdraws consent and stops queued promotions", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  await sql`insert into shop.marketing_consents (channel, recipient, status, source) values ('whatsapp', '9811122233', 'granted', 'checkout')`;
  await sql`insert into shop.notification_outbox (channel, recipient, template, kind) values ('whatsapp', '9811122233', 'campaign', 'promotional')`;
  const link = new URL(unsubscribeLink("http://localhost:3100", "e2e-unsub-secret", "whatsapp", "9811122233"));

  const forged = new URL(link); forged.searchParams.set("r", "9811122234");
  await page.goto(forged.pathname + forged.search);
  await expect(page.getByRole("heading", { name: "This link isn’t valid" })).toBeVisible();

  await page.goto(link.pathname + link.search);
  await expect(page.getByRole("heading", { name: "Stop WhatsApp offers?" })).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You’re unsubscribed" })).toBeVisible();

  const [c] = await sql<{ status: string; source: string }[]>`select status, source from shop.marketing_consents where recipient = '9811122233' order by id desc limit 1`;
  const [o] = await sql<{ status: string }[]>`select status from shop.notification_outbox where recipient = '9811122233' and kind = 'promotional'`;
  await sql.end();
  expect(c).toEqual({ status: "withdrawn", source: "unsubscribe_link" });
  expect(o!.status).toBe("suppressed");
});

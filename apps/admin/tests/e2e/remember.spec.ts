import { expect, test } from "@playwright/test";
import { acceptInvite, createStaffInvite, db, PASSWORD, totpFor } from "./helpers";

test.setTimeout(120_000);

test("8-character password in any language, and 'remember this device' keeps you signed in for 30 days", async ({ page, context }) => {
  const email = "remember@zentro.test";
  const { secret, step } = await acceptInvite(page, await createStaffInvite(email, "Ravi Remember", "support"));

  // change password: too short is refused, an 8-letter Telugu word is accepted
  await page.goto("/account/security");
  const pw = page.locator("form", { has: page.getByRole("button", { name: "Change password" }) });
  await pw.getByLabel("Current password").fill(PASSWORD);
  await pw.locator("input[name=password]").fill("ab12");
  await pw.getByLabel("Confirm new password").fill("ab12");
  await pw.evaluate((f: HTMLFormElement) => f.noValidate = true);
  await pw.getByRole("button", { name: "Change password" }).click();
  await expect(pw.getByRole("alert")).toContainText("at least 8 characters");
  const telugu = "అమరావతిరాజధాని"; // Amaravati Rajadhani
  await pw.getByLabel("Current password").fill(PASSWORD);
  await pw.locator("input[name=password]").fill(telugu);
  await pw.getByLabel("Confirm new password").fill(telugu);
  await pw.getByRole("button", { name: "Change password" }).click();
  await expect(pw.getByRole("status")).toContainText("Password changed");

  // sign in again with the new password; "remember" is ticked by default
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(telugu);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Remember this device for 30 days")).toBeChecked();
  const { code } = await totpFor(secret, step);
  await page.getByLabel("Authentication code").fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const cookie = (await context.cookies()).find((c) => c.name.includes("zentro_admin") && !c.name.includes("mfa"));
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);

  // a remembered session survives long inactivity (non-remembered ones end after 30 minutes)
  const sql = db();
  const [s] = await sql<{ remember: boolean }[]>`
    update shop.staff_sessions set last_seen_at = now() - interval '3 days'
    where id = (select id from shop.staff_sessions where staff_id = (select id from shop.staff_users where email = ${email})
                order by created_at desc limit 1) returning remember`;
  await sql.end();
  expect(s!.remember).toBe(true);
  await page.goto("/account/security");
  await expect(page.getByRole("heading", { name: "Security & sessions" })).toBeVisible();
});

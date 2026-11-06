import { expect, test } from "@playwright/test";
import { acceptInvite, createOwnerInvite, db, login, PASSWORD } from "./helpers";

const OWNER = "owner@zentro.test";
const SUPPORT = "support@zentro.test";
let ownerSecret = "";
let ownerStep = 0;

test.describe.configure({ mode: "serial" });
// each sign-in waits for a fresh 30 s TOTP window (codes cannot be replayed)
test.setTimeout(90_000);

test("signed-out visitors are sent to login for every admin route", async ({ page }) => {
  for (const path of ["/dashboard", "/staff", "/roles", "/audit-logs", "/orders"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("owner bootstrap: invite → password → authenticator → recovery codes → dashboard", async ({ page }) => {
  const link = createOwnerInvite(OWNER, "Asha Owner");
  ({ secret: ownerSecret, step: ownerStep } = await acceptInvite(page, link));
  await expect(page.getByRole("heading", { name: /Good to see you, Asha/ })).toBeVisible();
  await expect(page.getByText("Net revenue")).toBeVisible();
  await expect(page.getByText("Active products")).toBeVisible();
  // seed has 8 products; one variant is out of stock
  await expect(page.getByRole("link", { name: /Active products\s*8/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Low-stock alerts" })).toBeVisible();
  // the invite link cannot be reused
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Invitation not valid" })).toBeVisible();
});

test("a second owner bootstrap is refused", async () => {
  expect(() => createOwnerInvite("other@zentro.test", "Other")).toThrow();
});

test("wrong password and wrong code are rejected with generic errors", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(OWNER);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Email or password is incorrect");

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("not valid");
});

test("owner invites a Support Staff member; support has restricted access", async ({ page, browser }) => {
  ownerStep = await login(page, OWNER, ownerSecret, ownerStep);
  await page.goto("/staff");
  await page.getByLabel("Full name").fill("Sam Support");
  await page.getByLabel("Work email").fill(SUPPORT);
  await page.locator('form', { has: page.getByRole('button', { name: 'Create invitation' }) }).locator('select[name=roleId]').selectOption({ label: "Support Staff" });
  await page.getByRole("button", { name: "Create invitation" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("Invitation created");
  const link = (await status.locator("code").textContent())!;

  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  await acceptInvite(sp, link);
  // dashboard without financial figures
  await expect(sp.getByText("Paid orders")).toBeVisible();
  await expect(sp.getByText("Net revenue")).toHaveCount(0);
  // navigation hides admin sections
  await expect(sp.getByRole("link", { name: "Staff" })).toHaveCount(0);
  // and the server refuses them even when typed directly
  for (const path of ["/staff", "/roles", "/audit-logs", "/payments", "/messages/settings"]) {
    await sp.goto(path);
    await expect(sp).toHaveURL(/\/forbidden/);
  }
  await sp.goto("/support");
  await expect(sp.getByRole("heading", { name: "Support" })).toBeVisible();
  await ctx.close();

  // owner sees the new active account
  await page.reload();
  await expect(page.getByRole("row", { name: /Sam Support/ })).toContainText("Active");
});

test("sensitive actions require recent verification", async ({ page }) => {
  ownerStep = await login(page, OWNER, ownerSecret, ownerStep);
  const sql = db();
  await sql`update shop.staff_sessions set reauth_at = now() - interval '1 hour' where revoked_at is null`;
  await sql.end();
  await page.goto("/staff");
  await page.getByLabel("Full name").fill("Fin Ance");
  await page.getByLabel("Work email").fill("finance@zentro.test");
  await page.locator('form', { has: page.getByRole('button', { name: 'Create invitation' }) }).locator('select[name=roleId]').selectOption({ label: "Finance Staff" });
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("confirm it’s you");
  const check = db();
  const [r] = await check`select count(*)::int as n from shop.staff_users where email = 'finance@zentro.test'`;
  await check.end();
  expect(r!.n).toBe(0);
});

test("owner cannot disable themselves; last owner is protected", async ({ page }) => {
  ownerStep = await login(page, OWNER, ownerSecret, ownerStep);
  await page.goto("/staff");
  const me = page.getByRole("row", { name: /Asha Owner/ });
  await expect(me.getByRole("button", { name: "Disable" })).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await me.getByLabel("Role for Asha Owner").selectOption({ label: "Manager" });
  await me.getByRole("button", { name: "Save" }).click();
  await expect(me.getByRole("alert")).toContainText("at least one active Owner");
});

test("audit log records actions and verifies its hash chain", async ({ page }) => {
  ownerStep = await login(page, OWNER, ownerSecret, ownerStep);
  await page.goto("/audit-logs");
  await expect(page.getByRole("cell", { name: "staff.invite", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "auth.login_failed" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Verify integrity" }).click();
  await expect(page.getByRole("status")).toContainText("Intact");
  const sql = db();
  await expect(sql`update shop.audit_log set action = 'x.y' where id = 1`).rejects.toThrow(/append-only/);
  await sql.end();
});

test("sign out revokes the session server-side", async ({ page }) => {
  ownerStep = await login(page, OWNER, ownerSecret, ownerStep);
  const cookie = (await page.context().cookies()).find((c) => c.name === "zentro_admin")!;
  await page.locator("summary", { hasText: "Asha Owner" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  // replaying the old cookie must not work
  await page.context().addCookies([cookie]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

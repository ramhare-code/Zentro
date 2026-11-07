import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { acceptInvite, createStaffInvite, db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const PAGES = ["/dashboard", "/orders", "/products", "/products/new", "/categories", "/inventory", "/purchase-orders/new", "/payments", "/finance", "/finance/gst",
  "/coupons/new", "/promotions/new", "/banners/new", "/content", "/content/new", "/content/faqs", "/analytics", "/analytics/customers", "/messages/compose",
  "/reviews", "/support", "/customers", "/staff", "/roles", "/audit-logs", "/settings", "/settings/shipping", "/settings/tax", "/settings/system"];

async function audit(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBeLessThan(400);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${path}: ${v.id} (${v.impact}) ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("sign-in page meets WCAG A/AA and carries a strict per-request CSP", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|CSP/i.test(m.text())) errors.push(m.text()); });
  expect(await audit(page, "/login")).toEqual([]);
  const a = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  const b = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  expect(a).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{20,}' 'strict-dynamic'/);
  expect(a).not.toBe(b); // a fresh nonce on every request
  expect(a).toContain("frame-ancestors 'none'");
  expect(errors).toEqual([]);
  expect(await (await request.get("/api/health")).json()).toEqual({ status: "ok" });
});

test("every main admin page meets WCAG A/AA with no CSP violations", async ({ page }) => {
  const csp: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  // a test-only role with every owner permission: creating a real owner here would block the owner-bootstrap test
  const sql = db();
  await sql`insert into shop.admin_roles (key, name, description, permissions, is_system)
            select 'a11y_all', 'Accessibility audit', 'test only', permissions, false from shop.admin_roles where key = 'owner'
            on conflict (key) do nothing`;
  await sql.end();
  await acceptInvite(page, await createStaffInvite("a11y@zentro.test", "Uma Auditor", "a11y_all"));
  const problems: string[] = [];
  for (const p of PAGES) problems.push(...(await audit(page, p)));
  expect(problems, problems.join("\n")).toEqual([]);
  expect(csp, csp.join("\n")).toEqual([]);
});

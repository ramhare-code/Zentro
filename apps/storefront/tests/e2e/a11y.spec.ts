import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated WCAG 2.1 AA checks on the main customer pages (axe-core). Automated checks catch
// roughly a third of issues; keyboard and screen-reader checks are listed in docs/ACCESSIBILITY.md.
const PAGES = ["/", "/categories", "/c/audio", "/p/portable-bluetooth-speaker", "/search?q=bottle", "/cart", "/help", "/contact", "/policies/returns", "/feedback", "/account/login", "/account/register", "/support/new", "/wishlist"];

for (const path of PAGES) {
  test(`no WCAG A/AA violations on ${path}`, async ({ page }) => {
    await page.addInitScript(() => { document.cookie = "zentro_consent=essential; path=/"; });
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(400);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
}

test("security headers include a content security policy", async ({ request }) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"] ?? "";
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "form-action 'self'", "https://checkout.razorpay.com"]) expect(csp).toContain(d);
  const sec = await request.get("/.well-known/security.txt");
  expect(await sec.text()).toMatch(/^Contact: /m);
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ status: "ok" }); // no details without the token
});

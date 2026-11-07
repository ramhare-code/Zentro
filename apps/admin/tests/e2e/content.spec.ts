import { expect, test } from "@playwright/test";
import { acceptInvite, createStaffInvite, db } from "./helpers";

const SHOP = "http://localhost:3202";
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("manager edits, previews, publishes and restores policies; adds a page and FAQs", async ({ page, browser }) => {
  await acceptInvite(page, await createStaffInvite("words@zentro.test", "Kavya Content", "manager"));
  await page.goto("/content");
  await expect(page.getByText("4 policies are still the starter text.")).toBeVisible();
  await page.getByRole("link", { name: /Returns & refunds/ }).click();

  // edit with a live preview; unsafe link and HTML are flagged
  const body = page.locator("textarea[name=body]");
  const original = await body.inputValue();
  await body.fill(`${original}\n\n## Unboxing video\n\n- Record a video when you open the parcel\n- Keep the invoice\n\nSee [the help centre](/help) or [this](javascript:alert(1)). <script>alert("x")</script>`);
  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview.getByRole("heading", { name: "Unboxing video" })).toBeVisible();
  await expect(preview.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Content warnings" })).toContainText("Link “javascript:");
  await expect(page.getByRole("list", { name: "Content warnings" })).toContainText("HTML tags aren’t supported");
  await page.getByLabel("Note for history").fill("Added unboxing advice");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();

  const shop = await browser.newPage();
  await shop.goto(`${SHOP}/policies/returns`);
  await expect(shop.getByRole("heading", { level: 1, name: "Returns & refunds" })).toBeVisible();
  await expect(shop.getByText("Unboxing video")).toHaveCount(0); // drafts aren't public

  await page.reload();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish version 2" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await shop.reload();
  await expect(shop.getByRole("heading", { name: "Unboxing video" })).toBeVisible();
  await expect(shop.getByRole("link", { name: "the help centre" })).toHaveAttribute("href", "/help");
  await expect(shop.locator('a[href^="javascript"]')).toHaveCount(0);
  await expect(shop.getByText('<script>alert("x")</script>')).toBeVisible(); // shown as text, never run
  expect(await shop.evaluate(() => [...document.scripts].some((s) => s.textContent?.includes('alert("x")')))).toBe(false);

  // confirm the legal review
  await page.reload();
  await page.getByLabel("A legal adviser has reviewed this text").check();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish version 2" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await page.goto("/content");
  await expect(page.getByText("3 policies are still the starter text.")).toBeVisible();

  // restore the original as a new draft, publish it
  await page.getByRole("link", { name: /Returns & refunds/ }).click();
  const history = page.getByRole("region", { name: "Version history" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await history.getByRole("listitem").filter({ hasText: "Version 1" }).getByRole("button", { name: "Restore as draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied into a new draft" })).toBeVisible();
  await page.reload();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish version 3" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await shop.reload();
  await expect(shop.getByText("Unboxing video")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Version history" }).getByRole("listitem")).toHaveCount(3);

  // a new page appears in the footer
  await page.goto("/content/new");
  await page.getByLabel("Title", { exact: true }).fill("About Zentro");
  await page.getByLabel("Address").fill("about-us");
  await page.locator("textarea[name=body]").fill("## Who we are\n\n**Zentro** is run by a small team in Bengaluru. Write to {email}.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}\?created=1/);
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await shop.goto(SHOP);
  await shop.getByRole("contentinfo").getByRole("link", { name: "About Zentro" }).click();
  await expect(shop).toHaveURL(`${SHOP}/pages/about-us`);
  await expect(shop.getByRole("heading", { name: "Who we are" })).toBeVisible();
  await expect(shop.getByText("{email}")).toBeVisible(); // not configured in tests → left visible, and flagged in admin
  await page.reload();
  await page.getByRole("button", { name: "Take off store" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Taken off the store" })).toBeVisible();
  const gone = await shop.goto(`${SHOP}/pages/about-us`);
  expect(gone?.status()).toBe(404);

  // FAQs
  await page.goto("/content/faqs");
  const add = page.getByRole("region", { name: "Add a question" });
  await add.getByLabel("Topic").fill("Payments");
  await add.getByLabel("Question").fill("Can I pay with UPI?");
  await add.getByLabel("Answer").fill("Yes — UPI, cards, net banking and wallets through Razorpay.");
  await add.getByRole("button", { name: "Add question" }).click();
  await expect(add.getByRole("status")).toContainText("Added to the help centre");
  await shop.goto(`${SHOP}/help`);
  await expect(shop.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(shop.getByText("Can I pay with UPI?")).toBeVisible();
  await shop.close();

  const sql = db();
  const acts = await sql<{ action: string }[]>`select distinct action from shop.audit_log where action like 'content.%' or action like 'faq.%' order by 1`;
  expect(acts.map((a) => a.action)).toEqual(["content.create", "content.publish", "content.restore", "content.save", "content.unpublish", "faq.create"]);
  await sql.end();
});

test("support staff can't open content management", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("care5@zentro.test", "Ira Care", "support"));
  for (const p of ["/content", "/content/new", "/content/faqs"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/forbidden/);
  }
});

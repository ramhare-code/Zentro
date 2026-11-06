import { expect, test } from "@playwright/test";

type Sent = { to: string; text?: string; subject?: string };
const sent = async (): Promise<Sent[]> => (await fetch("http://localhost:3998/__sent")).json();

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.addInitScript(() => { document.cookie = "zentro_consent=essential; path=/"; });
});

test("guest raises a support request from the help centre, gets the private link, and replies", async ({ page }) => {
  await page.goto("/help");
  await page.getByRole("link", { name: "Send us a request" }).click();
  await page.getByLabel("Your name").fill("Imran Sheikh");
  await page.getByLabel("Email").fill("imran@example.com");
  await page.getByLabel(/Order number/).fill("ZN999999999");
  await page.getByLabel("What is it about?").selectOption("delivery");
  await page.getByLabel("Subject").fill("Where is my parcel?");
  await page.getByLabel("How can we help?").fill("My order was due yesterday but tracking hasn’t moved.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("couldn’t find that order number");
  await page.getByLabel(/Order number/).fill("");
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page).toHaveURL(/\/support\/ZT\d+\?t=.+&new=1/);
  await expect(page.getByRole("heading", { name: "Where is my parcel?" })).toBeVisible();
  await expect(page.getByText("Open", { exact: true })).toBeVisible();
  const url = new URL(page.url());
  const number = url.pathname.split("/").pop()!;

  await expect.poll(async () => (await sent()).find((m) => m.to === "imran@example.com" && m.subject?.includes(number))?.text ?? "").toContain(`/support/${number}?t=`);

  await page.getByLabel("Reply").fill("Order was placed on my brother’s account, adding details here.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("adding details here")).toBeVisible();

  await page.goto(`/support/${number}?t=forged`);
  await expect(page.getByRole("heading", { name: "We couldn’t open this request" })).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { advanceOrder, confirmPaidOrder, placeOrder, rotateGuestToken } from "@zentro/commerce/orders";
import { E2E_DB } from "../../playwright.config";

const sql = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.addInitScript(() => { document.cookie = "zentro_consent=essential; path=/"; });
});

async function register(page: Page, email: string) {
  await page.goto("/account/register");
  await page.getByLabel("Full name").fill("Divya Menon");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("coconut-rain-harbour-3");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account\?welcome=1/);
}

/** A paid order taken all the way to delivered, returning a working order-page URL. */
async function deliveredOrder(skus: string[]) {
  const s = sql();
  const vs = await s<{ id: string }[]>`select id from shop.product_variants where sku = any(${skus}::text[])`;
  const p = await placeOrder(s as never, {
    lines: vs.map((v) => ({ variantId: v.id, quantity: 1 })), email: "divya@example.com", phone: "9988776655",
    address: { fullName: "Divya Menon", phone: "9988776655", line1: "4 Marine Drive", city: "Kochi", stateCode: "KL", pincode: "682001" },
    idempotencyKey: crypto.randomUUID(), whatsappUpdates: false, sellerStateCode: "KA",
  });
  const rzp = `order_rev_${p.orderNumber}`;
  await s`insert into shop.payments (order_id, provider_order_id, amount_paise) values (${p.orderId}, ${rzp}, ${p.totalPaise})`;
  await confirmPaidOrder(s as never, { providerOrderId: rzp, providerPaymentId: `pay_${rzp}`, amountPaise: p.totalPaise, currency: "INR", status: "captured" });
  for (const to of ["processing", "packed"] as const) await advanceOrder(s as never, p.orderId, to, { actor: "operations" });
  await advanceOrder(s as never, p.orderId, "shipped", { actor: "operations", shipment: { carrier: "Blue Dart", trackingNumber: "BD1" } });
  await advanceOrder(s as never, p.orderId, "delivered", { actor: "operations" });
  const token = await rotateGuestToken(s as never, p.orderId);
  await s.end();
  return `/order/${p.orderNumber}?t=${encodeURIComponent(token)}`;
}

test("wishlist: guests are asked to sign in; save, move to cart, remove", async ({ page }) => {
  await page.goto("/p/minimal-desk-lamp");
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  await expect(page).toHaveURL(/\/account\/login\?next=\/p\/minimal-desk-lamp/);

  await register(page, "divya.wish@example.com");
  await page.goto("/p/minimal-desk-lamp");
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  await expect(page.getByRole("button", { name: "Saved to wishlist" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Saved to wishlist" })).toBeVisible(); // persisted
  await page.goto("/p/everyday-classic-sneakers");
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  await expect(page.getByRole("button", { name: "Saved to wishlist" })).toBeVisible();

  await page.goto("/wishlist");
  const lamp = page.getByRole("listitem").filter({ hasText: "Minimal Desk Lamp" });
  const shoes = page.getByRole("listitem").filter({ hasText: "Everyday Classic Sneakers" });
  await expect(shoes.getByRole("link", { name: "Choose options" })).toBeVisible(); // sizes → pick on product page
  await lamp.getByRole("button", { name: "Move to cart" }).click();
  await expect(lamp).toHaveCount(0);
  await page.goto("/cart");
  await expect(page.getByRole("link", { name: "Minimal Desk Lamp" })).toBeVisible();
  await page.goto("/wishlist");
  await shoes.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
});

test("verified reviews: clean ones publish and update the rating; flagged ones wait; one per item", async ({ page }) => {
  const s = sql(); // the organiser is out of stock in the seed; restock it for this order
  await s`update shop.product_variants set stock = 5 where sku = 'ZN-008-1'`;
  await s.end();
  const orderUrl = await deliveredOrder(["ZN-008-1", "ZN-006-1"]);
  await page.goto(orderUrl);
  const speaker = page.getByRole("listitem").filter({ hasText: "Portable Bluetooth Speaker" });
  await speaker.getByRole("button", { name: "Write a review" }).click();
  await speaker.getByText("4★").click();
  await speaker.getByLabel("Headline").fill("Loud and clear");
  await speaker.getByLabel("Your review").fill("Great bass for the size, battery lasts a full day of use.");
  await speaker.getByRole("button", { name: "Submit review" }).click();
  await expect(speaker.getByRole("status")).toContainText("Your review is live");

  const org = page.getByRole("listitem").filter({ hasText: "Compact Travel Organizer" });
  await org.getByRole("button", { name: "Write a review" }).click();
  await org.getByText("5★").click();
  await org.getByLabel("Your review").fill("Buy cheaper at www.example-deals.com, really handy pouch!");
  await org.getByRole("button", { name: "Submit review" }).click();
  await expect(org.getByRole("status")).toContainText("after a quick check");

  await page.reload();
  await expect(speaker.getByText("Reviewed — thank you")).toBeVisible();

  await page.goto("/p/portable-bluetooth-speaker");
  await expect(page.getByText("Based on 1 verified rating")).toBeVisible();
  await expect(page.getByText("Great bass for the size")).toBeVisible();
  await page.goto("/p/compact-travel-organizer");
  await expect(page.getByText("No reviews yet")).toBeVisible(); // pending, not shown

  const s2 = sql();
  const [p] = await s2<{ avg: string; n: number }[]>`select rating_avg::text as avg, rating_count as n from shop.products where slug = 'portable-bluetooth-speaker'`;
  const [pending] = await s2<{ flags: string[] }[]>`select auto_flags as flags from shop.reviews where status = 'pending'`;
  await s2.end();
  expect(p).toEqual({ avg: "4.00", n: 1 });
  expect(pending!.flags).toContain("contains a link");
});

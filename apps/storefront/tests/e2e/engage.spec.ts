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
  await expect(page.getByText("1 verified rating", { exact: true })).toBeVisible();
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

test("review photos: re-encoded without location data, hidden until a moderator approves", async ({ page, request }) => {
  const sharp = (await import("sharp")).default;
  // a phone photo carrying GPS coordinates in its EXIF data
  const withGps = await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg().withExif({ IFD0: { Make: "PhoneCo", Model: "X1" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 58/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "77/1 35/1 0/1" } }).toBuffer();
  expect((await sharp(withGps).metadata()).exif).toBeTruthy();

  const orderUrl = await deliveredOrder(["ZN-007-1"]);
  await page.goto(orderUrl);
  const bottle = page.getByRole("listitem").filter({ hasText: "Modern Insulated Bottle" });
  await bottle.getByRole("button", { name: "Write a review" }).click();
  await bottle.getByText("5★").click();
  await bottle.getByLabel("Your review").fill("Keeps water cold all day, even in the car.");
  await bottle.getByLabel(/^Photos/).setInputFiles([{ name: "fake.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<?php echo 1; ?>") }]);
  await bottle.getByRole("button", { name: "Submit review" }).click();
  await expect(bottle.locator('p[role="alert"]')).toContainText("JPEG, PNG, WebP or AVIF");
  await bottle.getByLabel(/^Photos/).setInputFiles([{ name: "bottle.jpg", mimeType: "image/jpeg", buffer: withGps }]);
  await bottle.getByRole("button", { name: "Submit review" }).click();
  await expect(bottle.getByRole("status")).toContainText("review and photos will appear after a quick check");

  const s = sql();
  const [m] = await s<{ url: string; reviewId: string; fileId: string }[]>`
    select m.url, m.review_id as "reviewId", substr(m.storage_key, 4) as "fileId" from shop.review_media m
    join shop.reviews r on r.id = m.review_id join shop.products p on p.id = r.product_id where p.slug = 'modern-insulated-bottle'`;
  const [f] = await s<{ bytes: Buffer; type: string }[]>`select bytes, content_type as type from shop.media_files where id = ${m!.fileId}`;
  expect(f!.type).toBe("image/webp");
  const meta = await sharp(f!.bytes).metadata();
  expect(meta.exif).toBeUndefined(); // location and camera data removed
  expect(meta.width).toBe(900);
  const [r] = await s<{ status: string; flags: string[] }[]>`select status, auto_flags as flags from shop.reviews where id = ${m!.reviewId}`;
  expect(r).toEqual({ status: "pending", flags: ["has photos"] });
  expect((await request.get(m!.url)).status()).toBe(404); // not public before approval

  await s`update shop.reviews set status = 'published' where id = ${m!.reviewId}`;
  await s.end();
  const img = await request.get(m!.url);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/webp");
  await page.goto("/p/modern-insulated-bottle");
  await expect(page.getByRole("list", { name: /Photos from/ }).getByRole("img")).toHaveCount(1);
});

test("site feedback is saved with the page it came from; bots are ignored", async ({ page }) => {
  await page.goto("/feedback?from=/cart");
  await page.getByText("Something isn’t working").click();
  await page.getByText("2★").click();
  await page.getByLabel("Your feedback").fill("The pincode check spun forever on my phone.");
  await page.getByLabel(/^Email/).fill("visitor@example.com");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByRole("status")).toContainText("we’ll reply if it needs an answer");
  const s = sql();
  const [f] = await s<{ kind: string; rating: number; page: string; email: string }[]>`select kind, rating, page_path as page, email from shop.site_feedback order by id desc limit 1`;
  expect(f).toEqual({ kind: "problem", rating: 2, page: "/cart", email: "visitor@example.com" });
  const [b] = await s<{ n: number }[]>`select count(*)::int as n from shop.site_feedback`;
  // a bot fills the hidden field: it's told "thanks" but nothing is stored
  await page.goto("/feedback");
  await page.getByText("An idea or suggestion").click();
  await page.getByLabel("Your feedback").fill("Buy cheap followers at example dot com");
  await page.locator('input[name="website"]').evaluate((el: HTMLInputElement) => { el.value = "http://spam.example"; });
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByRole("status")).toContainText("Thanks");
  const [a] = await s<{ n: number }[]>`select count(*)::int as n from shop.site_feedback`;
  expect(a!.n).toBe(b!.n);
  await s.end();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Send feedback" })).toBeVisible();
});

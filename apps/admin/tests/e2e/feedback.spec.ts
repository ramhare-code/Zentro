import { expect, test } from "@playwright/test";
import { placeOrder } from "@zentro/commerce/orders";
import { acceptInvite, createStaffInvite, db } from "./helpers";
import { makePng } from "./png";

const SHOP = "http://localhost:3202";
test.describe.configure({ mode: "serial" });

test("moderator sees review photos before they're public and can remove one", async ({ page, request }) => {
  const sql = db();
  // a pending review with two photos (as the storefront stores them)
  const [v] = await sql<{ id: string }[]>`select id from shop.product_variants where sku = 'ZN-005-2'`;
  const placed = await placeOrder(sql as never, {
    lines: [{ variantId: v!.id, quantity: 1 }], email: "sana@example.com", phone: "9123412345", sellerStateCode: "KA", idempotencyKey: crypto.randomUUID(), whatsappUpdates: false,
    address: { fullName: "Sana Khan", phone: "9123412345", line1: "9 Brigade Road", city: "Bengaluru", stateCode: "KA", pincode: "560025" },
  });
  const [item] = await sql<{ id: string; productId: string }[]>`select id, product_id as "productId" from shop.order_items where order_id = ${placed.orderId}`;
  const [rev] = await sql<{ id: string }[]>`insert into shop.reviews (product_id, order_item_id, display_name, rating, body, status, auto_flags)
    values (${item!.productId}, ${item!.id}, 'Sana', 4, 'Nice finish and sturdy.', 'pending', ${["has photos"]}) returning id`;
  const ids: string[] = [];
  for (const w of [400, 500]) {
    const png = makePng(w, w);
    const [f] = await sql<{ id: string }[]>`insert into shop.media_files (content_type, bytes, size_bytes, sha256, width, height, purpose) values ('image/png', ${png}, ${png.length}, ${"x" + w}, ${w}, ${w}, 'review') returning id`;
    const [m] = await sql<{ id: string }[]>`insert into shop.review_media (review_id, url, storage_key, sort_order) values (${rev!.id}, ${"/media/" + f!.id}, ${"db:" + f!.id}, ${w}) returning id`;
    ids.push(m!.id, f!.id);
  }
  expect((await request.get(`${SHOP}/media/${ids[1]}`)).status()).toBe(404); // not public yet

  await acceptInvite(page, await createStaffInvite("mod2@zentro.test", "Lina Moderator", "support"));
  await page.goto("/reviews?status=pending");
  const card = page.getByRole("listitem").filter({ hasText: "Nice finish and sturdy." });
  await expect(card).toContainText("Flagged: has photos");
  const photos = card.getByRole("list", { name: "Review photos" });
  await expect(photos.getByRole("img")).toHaveCount(2);
  expect((await page.request.get(`/api/review-photo/${ids[0]}`)).headers()["content-type"]).toBe("image/png");
  page.once("dialog", (d) => d.accept());
  await photos.getByRole("listitem").first().getByRole("button", { name: "Remove photo" }).click();
  await expect(card.getByRole("status").filter({ hasText: "Photo removed." })).toBeVisible();
  const left = await sql<{ n: number }[]>`select count(*)::int as n from shop.review_media where review_id = ${rev!.id}`;
  expect(left[0]!.n).toBe(1);
  const [gone] = await sql`select 1 from shop.media_files where id = ${ids[1]!}`;
  expect(gone).toBeUndefined(); // the stored file is deleted too

  await card.getByRole("button", { name: "Publish" }).click();
  await expect(card.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  expect((await request.get(`${SHOP}/media/${ids[3]}`)).status()).toBe(200);
  await sql.end();
});

test("support works through site feedback", async ({ page }) => {
  const sql = db();
  await sql`insert into shop.site_feedback (kind, rating, message, page_path, email, device) values ('problem', 2, 'Checkout button hidden behind the chat bubble.', '/checkout', 'shopper@example.com', 'mobile')`;
  await acceptInvite(page, await createStaffInvite("care7@zentro.test", "Ravi Care", "support"));
  await page.goto("/dashboard");
  await expect(page.getByText("Website problems reported").first()).toBeAttached();
  await page.goto("/support");
  await page.getByRole("link", { name: "Site feedback" }).click();
  const item = page.getByRole("article").filter({ hasText: "Checkout button hidden" });
  await expect(item).toContainText("Problem");
  await expect(item).toContainText("s•");  // support can't see full contact details
  await item.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked as reviewed." })).toBeVisible();
  const [f] = await sql<{ status: string; by: string | null }[]>`select status, handled_by::text as by from shop.site_feedback where message like 'Checkout button hidden%'`;
  expect(f!.status).toBe("reviewed");
  expect(f!.by).not.toBeNull();
  await sql.end();
});

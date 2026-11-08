import { expect, test, type Page } from "@playwright/test";
import { acceptInvite, createStaffInvite, db } from "./helpers";
import { makePng } from "./png";

const SHOP = "http://localhost:3202";
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
let productId = "";

const form = (page: Page, button: string) => page.locator("form", { has: page.getByRole("button", { name: button, exact: true }) });

test("manager builds a product from scratch and publishes it to the live storefront", async ({ page, request }) => {
  await acceptInvite(page, await createStaffInvite("catalog@zentro.test", "Meera Catalog", "manager"));

  // brand + category
  await page.goto("/brands");
  await form(page, "Add brand").getByLabel("Name").fill("Kaveri Crafts");
  await form(page, "Add brand").getByRole("button", { name: "Add brand" }).click();
  await expect(form(page, "Add brand").getByRole("status")).toContainText("Brand added");

  await page.goto("/categories");
  const newCat = form(page, "Create category");
  await newCat.getByLabel("Name").fill("Decor");
  await newCat.getByLabel("Parent").selectOption({ label: "Home" });
  await newCat.getByLabel("SEO title").fill("Handmade home decor");
  await newCat.getByRole("button", { name: "Create category" }).click();
  await expect(newCat.getByRole("status")).toContainText("Category created");

  // product draft
  await page.goto("/products/new");
  await page.getByLabel("Product name", { exact: true }).fill("Handwoven Cotton Cushion");
  await page.getByLabel("Category").selectOption({ label: "Home › Decor" });
  await page.getByLabel("Brand").selectOption({ label: "Kaveri Crafts" });
  await page.getByLabel(/Short description/).fill("Soft handloom cushion cover with a hidden zip.");
  await page.getByLabel(/Highlights/).fill("100% cotton\nHandwoven in Kerala");
  await page.getByLabel(/Specifications/).fill("Size: 40 × 40 cm\nCare | Wash | Gentle machine wash");
  await page.getByLabel("HSN code").fill("6304");
  await page.getByLabel("GST rate").selectOption("12");
  await page.getByLabel("SKU").fill("zn-cush-01");
  await page.getByLabel("Price (₹)").fill("899");
  await page.getByLabel("MRP (₹)").fill("1299");
  await page.getByLabel("Opening stock").fill("15");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}\?created=1/);
  productId = page.url().match(/products\/([0-9a-f-]{36})/)![1]!;
  await expect(page.getByRole("heading", { level: 1 })).toContainText("draft");

  // publishing needs an image
  const vis = form(page, "Publish now");
  await vis.getByRole("button", { name: "Publish now" }).click();
  await expect(vis.locator('p[role="alert"]')).toContainText("at least one image");

  // a disguised file is rejected, a real PNG is accepted
  const up = form(page, "Add images");
  await up.getByLabel("Upload images").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await up.getByRole("button", { name: "Add images" }).click();
  await expect(up.locator('p[role="alert"]')).toContainText("JPEG, PNG, WebP or AVIF");
  await up.getByLabel("Upload images").setInputFiles({ name: "cushion.png", mimeType: "image/png", buffer: makePng(600, 600) });
  await up.getByRole("button", { name: "Add images" }).click();
  await expect(up.getByRole("status")).toContainText("1 image(s) added");
  await page.reload();
  await expect(page.getByText("Main · 600×600")).toBeVisible();

  // variants
  const v1 = page.getByRole("listitem", { name: "Variant ZN-CUSH-01" });
  await v1.getByText("Edit variant").click();
  await v1.getByLabel("Options").fill("Color=Rust");
  await v1.getByRole("button", { name: "Save variant" }).click();
  await expect(v1.getByRole("status")).toContainText("Variant saved");
  await page.getByText("+ Add a variant").click();
  const add = form(page, "Add variant");
  await add.getByLabel("SKU").fill("ZN-CUSH-02");
  await add.getByLabel("Options").fill("Color=Rust");
  await add.getByLabel("Price (₹)").fill("949");
  await add.getByRole("button", { name: "Add variant" }).click();
  await expect(add.locator('p[role="alert"]')).toContainText("already has exactly these options");
  await add.getByLabel("Options").fill("Color=Indigo");
  await add.getByRole("button", { name: "Add variant" }).click();
  await expect(add.getByRole("status")).toContainText("Variant added");

  // logged stock changes
  await page.reload();
  const stock = page.getByRole("listitem", { name: "Variant ZN-CUSH-01" }).locator("form", { has: page.getByRole("button", { name: "Update stock" }) });
  await stock.locator("select[name=mode]").selectOption("remove");
  await stock.getByLabel("Quantity").fill("30");
  await stock.locator("select[name=reason]").selectOption("damaged");
  await stock.getByRole("button", { name: "Update stock" }).click();
  await expect(stock.locator('p[role="alert"]')).toContainText("Only 15 in stock");
  await stock.locator("select[name=mode]").selectOption("add");
  await stock.getByLabel("Quantity").fill("5");
  await stock.locator("select[name=reason]").selectOption("received");
  await stock.getByLabel("Note").fill("PO 1042");
  await stock.getByRole("button", { name: "Update stock" }).click();
  await expect(stock.getByRole("status")).toContainText("Stock +5 → 20");

  // publish → live on the storefront
  await page.reload();
  await form(page, "Publish now").getByRole("button", { name: "Publish now" }).click();
  await expect(form(page, "Unpublish").getByRole("status")).toContainText("Published");

  await page.goto(`${SHOP}/p/handwoven-cotton-cushion`);
  await expect(page.getByRole("heading", { level: 1, name: "Handwoven Cotton Cushion" })).toBeVisible();
  await expect(page.getByText("₹899").first()).toBeVisible();
  await expect(page.locator("label", { hasText: "Indigo" })).toContainText("(out of stock)");
  await expect(page.getByText("Gentle machine wash")).toBeVisible();
  const img = page.locator("img[alt='Handwoven Cotton Cushion']").first();
  await expect(img).toBeVisible();
  expect((await request.get(`${SHOP}${(await db()`select url from shop.product_media where product_id = ${productId}`.then((r) => r[0]!.url))}`)).status()).toBe(200);
  await page.goto(`${SHOP}/c/decor`);
  await expect(page.getByRole("heading", { level: 1, name: "Decor" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Handwoven Cotton Cushion" })).toBeVisible();
  await expect(page).toHaveTitle(/Handmade home decor/);

  const sql = db();
  const moves = await sql<{ reason: string; delta: number }[]>`select m.reason, m.delta from shop.stock_movements m join shop.product_variants v on v.id = m.variant_id where v.sku = 'ZN-CUSH-01' order by m.id`;
  await sql.end();
  expect(moves).toEqual([{ reason: "initial", delta: 15 }, { reason: "received", delta: 5 }]);

  // unpublish → gone from the shop
  await page.goto(`/products/${productId}`);
  await form(page, "Unpublish").getByRole("button", { name: "Unpublish" }).click();
  await expect(form(page, "Publish now").getByRole("status")).toContainText("Unpublished");
  await expect.poll(async () => (await request.get(`${SHOP}/p/handwoven-cotton-cushion`)).status()).toBe(404);
});

test("CSV import: preview catches errors, nothing changes until import, re-import is safe", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("importer@zentro.test", "Ishaan Import", "manager"));
  await page.goto("/products/import");
  const bad = [
    "slug,name,category_slug,brand,sku,options,price,mrp,stock,status,image_url",
    "brass-diya,Brass Diya,decor,kaveri-crafts,DIYA-S,Size=Small,349,499,30,published,https://images.unsplash.com/photo-1",
    "brass-diya,Brass Diya,decor,kaveri-crafts,DIYA-L,Size=Large,549,699,12,published,",
    "jute-mat,Jute Mat,no-such-category,,JUTE-1,,799,999,5,draft,",
    "evil,Evil,decor,,EVIL-1,,10,5,1,draft,https://evil.example.com/x.jpg",
  ].join("\n");
  await page.getByLabel("CSV file").setInputFiles({ name: "products.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("Row 4: unknown category_slug “no-such-category”")).toBeVisible();
  await expect(page.getByText(/Row 5: price must be positive and MRP at least the price/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();
  const s1 = db();
  const [none] = await s1<{ n: number }[]>`select count(*)::int as n from shop.products where slug = 'brass-diya'`;
  await s1.end();
  expect(none!.n).toBe(0);

  const good = bad.split("\n").slice(0, 3).join("\n") + "\n";
  await page.getByLabel("CSV file").setInputFiles({ name: "products.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("2 row(s): 1 new product(s), 0 to update · 2 new variant(s), 0 to update")).toBeVisible();
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 2 row(s)");

  // re-import with a stock change: updates, logs the movement, creates nothing new
  await page.getByLabel("CSV file").setInputFiles({ name: "restock.csv", mimeType: "text/csv", buffer: Buffer.from(good.replace(",30,published", ",42,published")) });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("0 new product(s), 1 to update · 0 new variant(s), 2 to update")).toBeVisible();
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status")).toContainText("Imported");
  const sql = db();
  const [p] = await sql<{ live: boolean; variants: number }[]>`select shop.product_live(is_active, publish_at, archived_at) as live, (select count(*)::int from shop.product_variants v where v.product_id = p.id) as variants from shop.products p where slug = 'brass-diya'`;
  const moves = await sql<{ delta: number; reason: string }[]>`select m.delta, m.reason from shop.stock_movements m join shop.product_variants v on v.id = m.variant_id where v.sku = 'DIYA-S' order by m.id`;
  await sql.end();
  expect(p).toEqual({ live: true, variants: 2 });
  expect(moves).toEqual([{ delta: 30, reason: "import" }, { delta: 12, reason: "import" }]);
});

test("category rules: no cycles, no deleting categories in use; bulk feature and archive", async ({ page }) => {
  await acceptInvite(page, await createStaffInvite("cats@zentro.test", "Tara Cats", "manager"));
  await page.goto("/categories");
  const home = page.getByRole("listitem", { name: "Category Home" }).first();
  await home.locator("summary").first().click();
  const homeForm = home.locator("form", { has: page.getByRole("button", { name: "Save category" }) }).first();
  await homeForm.getByLabel("Parent").selectOption({ label: "Home › Decor" });
  await homeForm.getByRole("button", { name: "Save category" }).click();
  await expect(homeForm.locator('p[role="alert"]')).toContainText("inside one of its own subcategories");

  const decor = page.getByRole("listitem", { name: "Category Decor" });
  page.once("dialog", (d) => d.accept());
  await decor.getByRole("button", { name: "Delete" }).click();
  await expect(decor.locator('p[role="alert"]')).toContainText("product(s) use this category");

  await page.goto("/products?q=brass");
  await page.getByLabel("Select Brass Diya").check();
  await page.getByLabel("Bulk action").selectOption("feature");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("status")).toContainText("1 product(s) updated");
  await page.getByLabel("Select Brass Diya").check();
  await page.getByLabel("Bulk action").selectOption("archive");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("status")).toContainText("1 product(s) updated");
  const sql = db();
  const [p] = await sql<{ archived: boolean; featured: boolean }[]>`select archived_at is not null as archived, is_featured as featured from shop.products where slug = 'brass-diya'`;
  const [a] = await sql<{ n: number }[]>`select count(*)::int as n from shop.audit_log where action like 'product.%' or action like 'variant.%' or action like 'stock.%' or action like 'category.%' or action like 'brand.%' or action like 'media.%'`;
  await sql.end();
  expect(p).toEqual({ archived: true, featured: false });
  expect(a!.n).toBeGreaterThan(10);
});

test("manager adds detailed information and side-by-side brand sections with a YouTube video", async ({ page }) => {
  const s = db();
  const [p] = await s<{ id: string }[]>`select id from shop.products where slug = 'modern-insulated-bottle'`;
  await s.end();
  await acceptInvite(page, await createStaffInvite("details@zentro.test", "Dina Details", "manager"));
  await page.goto(`/products/${p!.id}`);
  const details = form(page, "Save details");
  await details.getByLabel(/What’s in the box/).fill("Bottle\nSpare lid");
  await details.getByLabel("Warranty").fill("6 months on the seal");
  await details.getByLabel("Country of origin").fill("India");
  await details.getByLabel(/Manufacturer, packer & importer/).fill("Lumen Home, 1 Test Road, Bengaluru 560001");
  await details.getByLabel("Heading").first().fill("Keeps drinks cold");
  await details.getByLabel("Text").first().fill("Double walls keep water **cold for 24 hours**.");
  await details.getByLabel("Video or image link").first().fill("https://evil.example.com/x.jpg");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details.locator('p[role="alert"]')).toContainText("Brand section 1: use a YouTube link");
  await details.getByLabel("Video or image link").first().fill("https://youtu.be/dQw4w9WgXcQ?si=share");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details.getByRole("status")).toContainText("Saved");

  const s2 = db();
  const [r] = await s2<{ box: string[]; warranty: string; origin: string; story: unknown }[]>`
    select box_contents as box, warranty, country_of_origin as origin, brand_story as story from shop.products where id = ${p!.id}`;
  await s2.end();
  expect(r).toEqual({
    box: ["Bottle", "Spare lid"], warranty: "6 months on the seal", origin: "India",
    story: [{ title: "Keeps drinks cold", body: "Double walls keep water **cold for 24 hours**.", mediaUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", mediaKind: "youtube" }],
  });
});

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TransactionSql } from "@zentro/commerce/db";
import { audit } from "../audit";
import { allowedRemoteImage, GST_RATES, parseSpecs, revalidateStorefront, STOCK_REASONS } from "../catalog-admin";
import { parseCsv, parseOptions, slugify } from "../csv";
import { db } from "../db";
import { deleteStoredImage, MediaError, storeImage } from "../media";
import { authorize } from "../session";
import { classifyStoryMedia, isVideoFileUrl, youtubeId, type StorySection } from "@zentro/commerce/product-media";
import { guarded, UserError, type ActionResult } from "./result";

const str = (f: FormData, k: string, max = 5000) => String(f.get(k) ?? "").trim().slice(0, max);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
const rupees = (v: string, label: string) => {
  const n = Number(v.replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) throw new UserError(`Enter a valid ${label} in rupees.`);
  return Math.round(n * 100);
};

async function productPaths(productId: string) {
  const [p] = await db()<{ slug: string; cat: string; parent: string | null }[]>`
    select p.slug, c.slug as cat, pc.slug as parent from shop.products p join shop.categories c on c.id = p.category_id
    left join shop.categories pc on pc.id = c.parent_id where p.id = ${productId}`;
  return p ? ["/", "/categories", `/p/${p.slug}`, `/c/${p.cat}`, ...(p.parent ? [`/c/${p.parent}`] : [])] : ["/"];
}

async function refresh(productId: string, extra: string[] = []) {
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  await revalidateStorefront([...(await productPaths(productId)), ...extra]);
}

// ------------------------------------------------------------------ product details

interface ProductFields {
  name: string; slug: string; brand_id: string | null; category_id: string; short_description: string | null; description: string | null;
  highlights: string[]; specifications: unknown; hsn_code: string | null; gst_rate: number; is_featured: boolean;
  seo_title: string | null; seo_description: string | null;
  box_contents: string[]; warranty: string | null; country_of_origin: string | null; manufacturer_info: string | null;
  care_instructions: string | null; brand_story: StorySection[];
}

const OWN_MEDIA = /^\/media\/[0-9a-f-]{36}$/i;
const storyImageOk = (u: string) => OWN_MEDIA.test(u) || allowedRemoteImage(u);

/** Up to 8 "From the brand" sections: heading, text and an optional image, video file or YouTube link. */
function readBrandStory(f: FormData): StorySection[] {
  const titles = f.getAll("storyTitle").map(String), bodies = f.getAll("storyBody").map(String);
  const links = f.getAll("storyMedia").map(String), picks = f.getAll("storyPick").map(String);
  const out: StorySection[] = [];
  for (let i = 0; i < titles.length; i++) {
    const title = (titles[i] ?? "").trim(), body = (bodies[i] ?? "").trim();
    const link = ((links[i] ?? "").trim() || (picks[i] ?? "").trim());
    if (!title && !body && !link) continue;
    if (!title) throw new UserError(`Brand section ${i + 1}: add a heading.`);
    if (title.length > 120) throw new UserError(`Brand section ${i + 1}: keep the heading under 120 characters.`);
    if (body.length > 2000) throw new UserError(`Brand section ${i + 1}: keep the text under 2000 characters.`);
    const media = link ? classifyStoryMedia(link, storyImageOk) : null;
    if (link && !media) throw new UserError(`Brand section ${i + 1}: use a YouTube link, an https .mp4/.webm video, one of this product's images, or an image from an approved host.`);
    out.push({ title, body, mediaUrl: media?.url ?? null, mediaKind: media?.kind ?? null });
  }
  if (out.length > 8) throw new UserError("Up to 8 brand sections.");
  return out;
}

async function readProductFields(f: FormData, sql: ReturnType<typeof db>): Promise<ProductFields> {
  const name = str(f, "name", 200);
  if (name.length < 2) throw new UserError("Give the product a name.");
  const slug = str(f, "slug", 80) || slugify(name);
  if (!SLUG.test(slug)) throw new UserError("The URL slug can contain lowercase letters, numbers and hyphens.");
  const categoryId = z.guid().safeParse(f.get("categoryId")).data;
  if (!categoryId) throw new UserError("Choose a category.");
  const [cat] = await sql`select 1 from shop.categories where id = ${categoryId}`;
  if (!cat) throw new UserError("That category no longer exists.");
  const brandId = z.guid().safeParse(f.get("brandId")).data ?? null;
  if (brandId) {
    const [b] = await sql<{ active: boolean }[]>`select is_active as active from shop.brands where id = ${brandId}`;
    if (!b) throw new UserError("That brand no longer exists.");
  }
  const highlights = str(f, "highlights").split("\n").map((h) => h.trim()).filter(Boolean);
  if (highlights.length > 12 || highlights.some((h) => h.length > 200)) throw new UserError("Up to 12 highlights of 200 characters each.");
  const specs = parseSpecs(str(f, "specifications", 20000));
  if (typeof specs === "string") throw new UserError(specs);
  const hsn = str(f, "hsnCode", 8) || null;
  if (hsn && !/^\d{4,8}$/.test(hsn)) throw new UserError("HSN code should be 4–8 digits.");
  const gst = Number(str(f, "gstRate", 5));
  if (!(GST_RATES as readonly number[]).includes(gst)) throw new UserError("Choose a GST rate.");
  return {
    name, slug, brand_id: brandId, category_id: categoryId,
    short_description: str(f, "shortDescription", 300) || null, description: str(f, "description", 10000) || null,
    highlights, specifications: specs, hsn_code: hsn, gst_rate: gst, is_featured: f.get("isFeatured") === "on",
    seo_title: str(f, "seoTitle", 70) || null, seo_description: str(f, "seoDescription", 170) || null,
    ...readDetailFields(f),
  };
}

function readDetailFields(f: FormData) {
  const box = str(f, "boxContents", 4000).split("\n").map((h) => h.trim()).filter(Boolean);
  if (box.length > 20 || box.some((h) => h.length > 120)) throw new UserError("What's in the box: up to 20 lines of 120 characters.");
  const warranty = str(f, "warranty", 600), origin = str(f, "countryOfOrigin", 80);
  const maker = str(f, "manufacturerInfo", 1200), care = str(f, "careInstructions", 1200);
  if (warranty.length > 500) throw new UserError("Warranty: up to 500 characters.");
  if (origin.length > 60) throw new UserError("Country of origin: up to 60 characters.");
  if (maker.length > 1000) throw new UserError("Manufacturer details: up to 1000 characters.");
  if (care.length > 1000) throw new UserError("Care instructions: up to 1000 characters.");
  return {
    box_contents: box, warranty: warranty || null, country_of_origin: origin || null,
    manufacturer_info: maker || null, care_instructions: care || null, brand_story: readBrandStory(f),
  };
}

export async function createProductAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("products.write");
    const sql = db();
    const fields = await readProductFields(f, sql);
    const sku = str(f, "sku", 40).toUpperCase();
    if (!SKU.test(sku)) throw new UserError("SKU: 3–40 capital letters, numbers or hyphens.");
    const price = rupees(str(f, "price"), "price"), mrp = rupees(str(f, "mrp") || str(f, "price"), "MRP");
    if (mrp < price) throw new UserError("MRP can’t be lower than the selling price.");
    const stock = z.coerce.number().int().min(0).max(1_000_000).safeParse(str(f, "stock") || "0").data;
    if (stock === undefined) throw new UserError("Stock must be a whole number.");
    const id = await sql.begin(async (tx) => {
      const [dupe] = await tx`select 1 from shop.products where slug = ${fields.slug}`;
      if (dupe) throw new UserError("Another product already uses this URL slug.");
      const [dsku] = await tx`select 1 from shop.product_variants where sku = ${sku}`;
      if (dsku) throw new UserError("That SKU is already in use.");
      const [p] = await tx<{ id: string }[]>`
        insert into shop.products ${tx({ ...fields, specifications: tx.json(fields.specifications as never), brand_story: tx.json(fields.brand_story as never), is_active: false, created_by: s.staffId, updated_by: s.staffId } as never)} returning id`;
      const [v] = await tx<{ id: string }[]>`insert into shop.product_variants (product_id, sku, price_paise, mrp_paise, stock) values (${p!.id}, ${sku}, ${price}, ${mrp}, ${stock}) returning id`;
      if (stock > 0) await tx`insert into shop.stock_movements (variant_id, delta, stock_after, reason, staff_id) values (${v!.id}, ${stock}, ${stock}, 'initial', ${s.staffId})`;
      await audit(s, { action: "product.create", entityType: "product", entityId: p!.id, details: { name: fields.name, sku } }, tx);
      return p!.id;
    });
    redirect(`/products/${id}?created=1`);
  });
}

export async function updateProductAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("products.write");
    const id = z.guid().parse(f.get("productId"));
    const sql = db();
    const fields = await readProductFields(f, sql);
    const oldPaths = await productPaths(id);
    await sql.begin(async (tx) => {
      const [dupe] = await tx`select 1 from shop.products where slug = ${fields.slug} and id <> ${id}`;
      if (dupe) throw new UserError("Another product already uses this URL slug.");
      const [before] = await tx<{ slug: string }[]>`select slug from shop.products where id = ${id} for update`;
      if (!before) throw new UserError("Product not found.");
      await tx`update shop.products set ${tx({ ...fields, specifications: tx.json(fields.specifications as never), brand_story: tx.json(fields.brand_story as never), updated_by: s.staffId } as never)} where id = ${id}`;
      await audit(s, { action: "product.update", entityType: "product", entityId: id, details: before.slug !== fields.slug ? { slug: { from: before.slug, to: fields.slug } } : {} }, tx);
    });
    await refresh(id, oldPaths);
    return { ok: true, message: "Saved. The shop updates within a few seconds." };
  });
}

// ------------------------------------------------------------------ visibility

async function publishProblems(tx: TransactionSql | ReturnType<typeof db>, id: string): Promise<string | null> {
  const [r] = await tx<{ variants: number; images: number; archived: boolean }[]>`
    select (select count(*)::int from shop.product_variants where product_id = ${id} and is_active) as variants,
           (select count(*)::int from shop.product_media where product_id = ${id} and kind = 'image') as images,
           (archived_at is not null) as archived
    from shop.products where id = ${id}`;
  if (!r) return "Product not found.";
  if (r.archived) return "Restore the product from the archive first.";
  if (!r.variants) return "Add at least one active variant (SKU and price) before publishing.";
  if (!r.images) return "Add at least one image before publishing.";
  return null;
}

export async function setVisibilityAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const op = z.enum(["publish", "schedule", "unpublish", "archive", "restore"]).parse(f.get("op"));
    const s = await authorize(op === "archive" || op === "restore" ? "products.archive" : "products.publish");
    const id = z.guid().parse(f.get("productId"));
    const sql = db();
    let message = "";
    await sql.begin(async (tx) => {
      if (op === "publish" || op === "schedule") {
        const problem = await publishProblems(tx, id);
        if (problem) throw new UserError(problem);
      }
      if (op === "publish") {
        await tx`update shop.products set is_active = true, publish_at = null, updated_by = ${s.staffId} where id = ${id}`;
        message = "Published — it’s live on the shop.";
      } else if (op === "schedule") {
        const at = new Date(str(f, "publishAt") + ":00+05:30");
        if (Number.isNaN(at.getTime()) || at <= new Date()) throw new UserError("Choose a future date and time (IST).");
        await tx`update shop.products set is_active = true, publish_at = ${at}, updated_by = ${s.staffId} where id = ${id}`;
        message = `Scheduled to go live at ${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`;
      } else if (op === "unpublish") {
        await tx`update shop.products set is_active = false, publish_at = null, updated_by = ${s.staffId} where id = ${id}`;
        message = "Unpublished — saved as a draft and hidden from the shop.";
      } else if (op === "archive") {
        await tx`update shop.products set is_active = false, archived_at = now(), is_featured = false, updated_by = ${s.staffId} where id = ${id}`;
        await tx`delete from shop.cart_items where variant_id in (select id from shop.product_variants where product_id = ${id})`;
        message = "Archived. It’s hidden everywhere; past orders keep their details.";
      } else {
        await tx`update shop.products set archived_at = null, is_active = false, updated_by = ${s.staffId} where id = ${id}`;
        message = "Restored as a draft.";
      }
      await audit(s, { action: `product.${op}`, entityType: "product", entityId: id }, tx);
    });
    await refresh(id);
    return { ok: true, message };
  });
}

export async function bulkProductsAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const op = z.enum(["publish", "unpublish", "feature", "unfeature", "archive", "move"]).parse(f.get("op"));
    const s = await authorize(op === "archive" ? "products.archive" : op === "publish" || op === "unpublish" ? "products.publish" : "products.write");
    const ids = f.getAll("ids").map(String).filter((x) => z.guid().safeParse(x).success);
    if (!ids.length) throw new UserError("Select at least one product.");
    if (ids.length > 200) throw new UserError("Select up to 200 products at a time.");
    const sql = db();
    const skipped: string[] = [];
    let done = 0;
    const targetCat = op === "move" ? z.guid().safeParse(f.get("categoryId")).data : undefined;
    if (op === "move" && !targetCat) throw new UserError("Choose the category to move them to.");
    const paths = (await Promise.all(ids.map(productPaths))).flat();
    await sql.begin(async (tx) => {
      for (const id of ids) {
        if (op === "publish") {
          const problem = await publishProblems(tx, id);
          if (problem) { const [n] = await tx<{ name: string }[]>`select name from shop.products where id = ${id}`; skipped.push(`${n?.name ?? id}: ${problem}`); continue; }
          await tx`update shop.products set is_active = true, publish_at = null, updated_by = ${s.staffId} where id = ${id}`;
        } else if (op === "unpublish") await tx`update shop.products set is_active = false, publish_at = null, updated_by = ${s.staffId} where id = ${id} and archived_at is null`;
        else if (op === "feature") await tx`update shop.products set is_featured = true where id = ${id} and archived_at is null`;
        else if (op === "unfeature") await tx`update shop.products set is_featured = false where id = ${id}`;
        else if (op === "archive") await tx`update shop.products set is_active = false, archived_at = coalesce(archived_at, now()), is_featured = false where id = ${id}`;
        else await tx`update shop.products set category_id = ${targetCat!} where id = ${id}`;
        done++;
      }
      await audit(s, { action: `product.bulk_${op}`, entityType: "product", details: { count: done, ids, skipped: skipped.length } }, tx);
    });
    revalidatePath("/products");
    await revalidateStorefront([...paths, ...(targetCat ? (await db()<{ slug: string }[]>`select slug from shop.categories where id = ${targetCat}`).map((c) => `/c/${c.slug}`) : [])]);
    return { ok: true, message: `${done} product(s) updated.${skipped.length ? ` Skipped ${skipped.length}: ${skipped.join("; ")}` : ""}` };
  });
}

// ------------------------------------------------------------------ variants & stock

export async function saveVariantAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("products.write");
    const productId = z.guid().parse(f.get("productId"));
    const variantId = z.guid().safeParse(f.get("variantId")).data;
    const sku = str(f, "sku", 40).toUpperCase();
    if (!SKU.test(sku)) throw new UserError("SKU: 3–40 capital letters, numbers or hyphens.");
    const options = parseOptions(str(f, "options", 300));
    if (!options) throw new UserError("Options should look like “Color=Black; Size=M”.");
    const price = rupees(str(f, "price"), "price"), mrp = rupees(str(f, "mrp") || str(f, "price"), "MRP");
    if (mrp < price) throw new UserError("MRP can’t be lower than the selling price.");
    const weight = str(f, "weightGrams") ? z.coerce.number().int().min(1).max(100_000).safeParse(str(f, "weightGrams")).data : null;
    if (weight === undefined) throw new UserError("Weight is in whole grams.");
    const threshold = z.coerce.number().int().min(0).max(100_000).safeParse(str(f, "lowStockThreshold") || "5").data ?? 5;
    const mediaId = z.guid().safeParse(f.get("mediaId")).data ?? null;
    const sql = db();
    await sql.begin(async (tx) => {
      const [dsku] = await tx`select 1 from shop.product_variants where sku = ${sku} and id is distinct from ${variantId ?? null}`;
      if (dsku) throw new UserError("That SKU is already used by another variant.");
      const [dopt] = await tx`select 1 from shop.product_variants where product_id = ${productId} and options = ${tx.json(options as never)} and id is distinct from ${variantId ?? null}`;
      if (dopt) throw new UserError("Another variant of this product already has exactly these options.");
      if (mediaId) { const [m] = await tx`select 1 from shop.product_media where id = ${mediaId} and product_id = ${productId}`; if (!m) throw new UserError("Pick one of this product’s images."); }
      if (variantId) {
        const [before] = await tx<{ price: number; mrp: number }[]>`select price_paise as price, mrp_paise as mrp from shop.product_variants where id = ${variantId} and product_id = ${productId} for update`;
        if (!before) throw new UserError("Variant not found.");
        await tx`update shop.product_variants set sku = ${sku}, options = ${tx.json(options as never)}, price_paise = ${price}, mrp_paise = ${mrp},
                 weight_grams = ${weight}, low_stock_threshold = ${threshold}, media_id = ${mediaId}, is_active = ${f.get("isActive") === "on"} where id = ${variantId}`;
        await audit(s, { action: "variant.update", entityType: "variant", entityId: variantId, details: before.price !== price || before.mrp !== mrp ? { price: { from: before.price, to: price }, mrp: { from: before.mrp, to: mrp } } : {} }, tx);
      } else {
        const stock = z.coerce.number().int().min(0).max(1_000_000).safeParse(str(f, "stock") || "0").data ?? 0;
        const [{ pos }] = (await tx<{ pos: number }[]>`select coalesce(max(position), -1)::int + 1 as pos from shop.product_variants where product_id = ${productId}`) as unknown as [{ pos: number }];
        const [v] = await tx<{ id: string }[]>`
          insert into shop.product_variants (product_id, sku, options, price_paise, mrp_paise, stock, weight_grams, low_stock_threshold, media_id, position)
          values (${productId}, ${sku}, ${tx.json(options as never)}, ${price}, ${mrp}, ${stock}, ${weight}, ${threshold}, ${mediaId}, ${pos}) returning id`;
        if (stock > 0) await tx`insert into shop.stock_movements (variant_id, delta, stock_after, reason, staff_id) values (${v!.id}, ${stock}, ${stock}, 'initial', ${s.staffId})`;
        await audit(s, { action: "variant.create", entityType: "variant", entityId: v!.id, details: { sku, options } }, tx);
      }
    });
    await refresh(productId);
    return { ok: true, message: variantId ? "Variant saved." : "Variant added." };
  });
}

export async function removeVariantAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("products.write");
    const productId = z.guid().parse(f.get("productId"));
    const variantId = z.guid().parse(f.get("variantId"));
    const sql = db();
    let message = "";
    await sql.begin(async (tx) => {
      const [v] = await tx<{ ordered: boolean }[]>`select exists (select 1 from shop.order_items where variant_id = ${variantId}) as ordered from shop.product_variants where id = ${variantId} and product_id = ${productId}`;
      if (!v) throw new UserError("Variant not found.");
      if (v.ordered) {
        await tx`update shop.product_variants set is_active = false where id = ${variantId}`;
        message = "This variant has been ordered before, so it was deactivated (kept for order history).";
      } else {
        await tx`delete from shop.product_variants where id = ${variantId}`;
        message = "Variant deleted.";
      }
      await audit(s, { action: v.ordered ? "variant.deactivate" : "variant.delete", entityType: "variant", entityId: variantId }, tx);
    });
    await refresh(productId);
    return { ok: true, message };
  });
}

/** Every stock change is a logged movement with a reason — stock is never overwritten silently. */
export async function adjustStockAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("inventory.adjust");
    const variantId = z.guid().parse(f.get("variantId"));
    const mode = z.enum(["add", "remove", "set"]).parse(f.get("mode"));
    const qty = z.coerce.number().int().min(0).max(1_000_000).safeParse(str(f, "quantity")).data;
    if (qty === undefined || (mode !== "set" && qty === 0)) throw new UserError("Enter a quantity.");
    const reason = z.enum(Object.keys(STOCK_REASONS) as [keyof typeof STOCK_REASONS]).safeParse(f.get("reason")).data;
    if (!reason) throw new UserError("Choose a reason for the change.");
    const note = str(f, "note", 300) || null;
    const sql = db();
    const result = await sql.begin(async (tx) => {
      const [v] = await tx<{ stock: number; productId: string }[]>`select stock, product_id as "productId" from shop.product_variants where id = ${variantId} for update`;
      if (!v) throw new UserError("Variant not found.");
      const delta = mode === "add" ? qty : mode === "remove" ? -qty : qty - v.stock;
      if (delta === 0) throw new UserError("Stock is already at that level.");
      const after = v.stock + delta;
      if (after < 0) throw new UserError(`Only ${v.stock} in stock — can’t remove ${qty}.`);
      await tx`update shop.product_variants set stock = ${after} where id = ${variantId}`;
      await tx`insert into shop.stock_movements (variant_id, delta, stock_after, reason, note, staff_id) values (${variantId}, ${delta}, ${after}, ${reason}, ${note}, ${s.staffId})`;
      await audit(s, { action: "stock.adjust", entityType: "variant", entityId: variantId, details: { delta, after, reason } }, tx);
      return { productId: v.productId, after, delta };
    });
    await refresh(result.productId);
    return { ok: true, message: `Stock ${result.delta > 0 ? "+" : ""}${result.delta} → ${result.after}.` };
  });
}

// ------------------------------------------------------------------ media

export async function uploadMediaAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("products.write");
    const productId = z.guid().parse(f.get("productId"));
    const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
    const url = str(f, "imageUrl", 1000);
    if (!files.length && !url) throw new UserError("Choose image files or paste an image link.");
    if (files.length > 10) throw new UserError("Upload up to 10 images at a time.");
    const sql = db();
    const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from shop.product_media where product_id = ${productId}`) as unknown as [{ n: number }];
    if (n + files.length + (url ? 1 : 0) > 20) throw new UserError("A product can have up to 20 images and videos.");
    const name = (await sql<{ name: string }[]>`select name from shop.products where id = ${productId}`)[0]?.name ?? "";
    let added = 0;
    for (const file of files) {
      let stored;
      try { stored = await storeImage(file, s.staffId); } catch (e) { if (e instanceof MediaError) throw new UserError(`${file.name}: ${e.message}`); throw e; }
      await sql`insert into shop.product_media (product_id, kind, url, alt, width, height, sort_order, storage_key)
                values (${productId}, 'image', ${stored.url}, ${name}, ${stored.width}, ${stored.height}, ${n + added}, ${stored.key})`;
      added++;
    }
    if (url) {
      if (!allowedRemoteImage(url)) throw new UserError("Image links must be https and from an approved image host. Upload the file instead.");
      await sql`insert into shop.product_media (product_id, kind, url, alt, sort_order) values (${productId}, 'image', ${url}, ${name}, ${n + added})`;
      added++;
    }
    await audit(s, { action: "media.add", entityType: "product", entityId: productId, details: { count: added } });
    await refresh(productId);
    return { ok: true, message: `${added} image(s) added.` };
  });
}

export async function addVideoAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("products.write");
    const productId = z.guid().parse(f.get("productId"));
    const raw = str(f, "videoUrl", 1000);
    const yt = youtubeId(raw);
    const kind = yt ? "youtube" : "video";
    const url = yt ? `https://www.youtube.com/watch?v=${yt}` : raw;
    if (!yt && !isVideoFileUrl(raw)) throw new UserError("Paste a YouTube link, or an https link to an .mp4 or .webm file (e.g. from your Supabase Storage bucket).");
    const posterId = z.guid().safeParse(f.get("posterMediaId")).data;
    const sql = db();
    const poster = posterId ? (await sql<{ url: string }[]>`select url from shop.product_media where id = ${posterId} and product_id = ${productId} and kind = 'image'`)[0]?.url ?? null : null;
    const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from shop.product_media where product_id = ${productId}`) as unknown as [{ n: number }];
    await sql`insert into shop.product_media (product_id, kind, url, poster_url, alt, sort_order) values (${productId}, ${kind}, ${url}, ${poster}, ${str(f, "alt", 200) || "Product video"}, ${n})`;
    await audit(s, { action: "media.add_video", entityType: "product", entityId: productId });
    await refresh(productId);
    return { ok: true, message: "Video added." };
  });
}

export async function mediaAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("products.write");
    const productId = z.guid().parse(f.get("productId"));
    const mediaId = z.guid().parse(f.get("mediaId"));
    const op = z.enum(["alt", "up", "down", "delete"]).parse(f.get("op"));
    const sql = db();
    await sql.begin(async (tx) => {
      const items = await tx<{ id: string; kind: string; storageKey: string | null }[]>`
        select id, kind, storage_key as "storageKey" from shop.product_media where product_id = ${productId} order by sort_order, created_at for update`;
      const i = items.findIndex((m) => m.id === mediaId);
      if (i < 0) throw new UserError("Image not found.");
      if (op === "alt") {
        await tx`update shop.product_media set alt = ${str(f, "alt", 200)} where id = ${mediaId}`;
      } else if (op === "delete") {
        const [{ live }] = (await tx<{ live: boolean }[]>`select shop.product_live(is_active, publish_at, archived_at) as live from shop.products where id = ${productId}`) as unknown as [{ live: boolean }];
        if (live && items.filter((m) => m.kind === "image").length === 1 && items[i]!.kind === "image") throw new UserError("A published product needs at least one image. Add another or unpublish first.");
        await tx`update shop.product_variants set media_id = null where media_id = ${mediaId}`;
        await tx`delete from shop.product_media where id = ${mediaId}`;
        await deleteStoredImage(items[i]!.storageKey);
      } else {
        const j = op === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j]!, items[i]!];
        for (const [k, m] of items.entries()) await tx`update shop.product_media set sort_order = ${k} where id = ${m.id}`;
      }
      await audit(s, { action: `media.${op}`, entityType: "product", entityId: productId, details: { mediaId } }, tx);
    });
    await refresh(productId);
    return { ok: true, message: { alt: "Alt text saved.", up: "Moved.", down: "Moved.", delete: "Removed." }[op] };
  });
}

// ------------------------------------------------------------------ CSV import

const REQUIRED = ["slug", "name", "category_slug", "sku", "price"];

export type ImportResult = (NonNullable<ActionResult> & { preview?: { rows: number; newProducts: number; updatedProducts: number; newVariants: number; updatedVariants: number; errors: string[] } }) | undefined;

/**
 * Two-step import: "preview" validates every row and reports what would change;
 * "commit" applies everything in one transaction (all or nothing).
 * Rows are matched by product slug and variant SKU, so re-importing is safe.
 */
export async function importCsvAction(_p: ImportResult, f: FormData): Promise<ImportResult> {
  return (await guarded(async () => {
    const s = await authorize("products.write");
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a CSV file.");
    if (file.size > 2 * 1024 * 1024) throw new UserError("CSV files can be up to 2 MB.");
    const commit = f.get("mode") === "commit";
    let rows: string[][];
    try { rows = parseCsv(await file.text()); } catch { throw new UserError("This file isn’t valid CSV (check for an unclosed quote)."); }
    const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
    const missing = REQUIRED.filter((c) => !header.includes(c));
    if (missing.length) throw new UserError(`Missing column(s): ${missing.join(", ")}. Download the template for the expected format.`);
    if (rows.length === 0) throw new UserError("The file has no data rows.");
    if (rows.length > 2000) throw new UserError("Import up to 2,000 rows at a time.");
    const col = (r: string[], c: string) => (r[header.indexOf(c)] ?? "").trim();
    const sql = db();
    const [cats, brands, existingProducts, existingSkus] = await Promise.all([
      sql<{ id: string; slug: string }[]>`select id, slug from shop.categories`,
      sql<{ id: string; slug: string; name: string }[]>`select id, slug, name from shop.brands`,
      sql<{ id: string; slug: string }[]>`select id, slug from shop.products`,
      sql<{ id: string; sku: string; productSlug: string; stock: number }[]>`select v.id, v.sku, p.slug as "productSlug", v.stock from shop.product_variants v join shop.products p on p.id = v.product_id`,
    ]);
    const errors: string[] = [];
    const products = new Map<string, { row: number; fields: Record<string, unknown>; status: string; image: string | null }>();
    const variants: { row: number; slug: string; sku: string; options: Record<string, string>; price: number; mrp: number; stock: number | null; weight: number | null }[] = [];
    const seenSku = new Set<string>();
    rows.forEach((r, idx) => {
      const n = idx + 2;
      const err = (m: string) => errors.push(`Row ${n}: ${m}`);
      const slug = col(r, "slug").toLowerCase(), sku = col(r, "sku").toUpperCase();
      if (!SLUG.test(slug)) return err("slug must be lowercase letters, numbers and hyphens");
      if (!SKU.test(sku)) return err("sku must be 3–40 capital letters, numbers or hyphens");
      if (seenSku.has(sku)) return err(`SKU ${sku} appears twice in the file`);
      seenSku.add(sku);
      const owner = existingSkus.find((v) => v.sku === sku);
      if (owner && owner.productSlug !== slug) return err(`SKU ${sku} already belongs to product “${owner.productSlug}”`);
      const price = Math.round(Number(col(r, "price").replace(/[,₹\s]/g, "")) * 100), mrp = col(r, "mrp") ? Math.round(Number(col(r, "mrp").replace(/[,₹\s]/g, "")) * 100) : price;
      if (!(price > 0) || !(mrp >= price)) return err("price must be positive and MRP at least the price");
      const options = parseOptions(col(r, "options"));
      if (!options) return err("options should look like Color=Black; Size=M");
      const stockRaw = col(r, "stock");
      const stock = stockRaw === "" ? null : Number(stockRaw);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return err("stock must be a whole number");
      const weightRaw = col(r, "weight_grams");
      const weight = weightRaw ? Number(weightRaw) : null;
      if (weight !== null && (!Number.isInteger(weight) || weight <= 0)) return err("weight_grams must be a whole number");
      variants.push({ row: n, slug, sku, options, price, mrp, stock, weight });
      if (products.has(slug)) return;
      const name = col(r, "name");
      if (name.length < 2) return err("name is required");
      const cat = cats.find((c) => c.slug === col(r, "category_slug").toLowerCase());
      if (!cat) return err(`unknown category_slug “${col(r, "category_slug")}”`);
      const brandVal = col(r, "brand");
      const brand = brandVal ? brands.find((b) => b.slug === brandVal.toLowerCase() || b.name.toLowerCase() === brandVal.toLowerCase()) : null;
      if (brandVal && !brand) return err(`unknown brand “${brandVal}” — add it under Brands first`);
      const gst = col(r, "gst_rate") ? Number(col(r, "gst_rate")) : 18;
      if (!(GST_RATES as readonly number[]).includes(gst)) return err("gst_rate must be one of 0, 0.25, 3, 5, 12, 18, 28");
      const hsn = col(r, "hsn_code");
      if (hsn && !/^\d{4,8}$/.test(hsn)) return err("hsn_code must be 4–8 digits");
      const status = (col(r, "status") || "draft").toLowerCase();
      if (!["draft", "published"].includes(status)) return err("status must be draft or published");
      const image = col(r, "image_url") || null;
      if (image && !allowedRemoteImage(image)) return err("image_url must be https from an approved image host");
      if (status === "published" && !image && !existingProducts.some((p) => p.slug === slug)) return err("a new product needs image_url to be published");
      products.set(slug, {
        row: n, status, image,
        fields: {
          slug, name: name.slice(0, 200), category_id: cat.id, brand_id: brand?.id ?? null,
          short_description: col(r, "short_description").slice(0, 300) || null, description: col(r, "description").slice(0, 10000) || null,
          highlights: col(r, "highlights").split("|").map((h) => h.trim()).filter(Boolean).slice(0, 12),
          hsn_code: hsn || null, gst_rate: gst, is_featured: ["yes", "true", "1"].includes(col(r, "featured").toLowerCase()),
        },
      });
    });
    const preview = {
      rows: rows.length,
      newProducts: [...products.keys()].filter((sl) => !existingProducts.some((p) => p.slug === sl)).length,
      updatedProducts: [...products.keys()].filter((sl) => existingProducts.some((p) => p.slug === sl)).length,
      newVariants: variants.filter((v) => !existingSkus.some((x) => x.sku === v.sku)).length,
      updatedVariants: variants.filter((v) => existingSkus.some((x) => x.sku === v.sku)).length,
      errors: errors.slice(0, 50),
    };
    if (!commit) return { ok: errors.length === 0, preview, message: errors.length ? undefined : "Everything looks good. Import to apply these changes." };
    if (errors.length) return { error: `Fix ${errors.length} problem(s) first — nothing was imported.`, preview };

    await sql.begin(async (tx) => {
      const ids = new Map<string, string>();
      for (const [slug, p] of products) {
        const [row] = await tx<{ id: string }[]>`
          insert into shop.products ${tx({ ...p.fields, is_active: false, created_by: s.staffId, updated_by: s.staffId } as never)}
          on conflict (slug) do update set name = excluded.name, category_id = excluded.category_id, brand_id = excluded.brand_id,
            short_description = coalesce(excluded.short_description, shop.products.short_description),
            description = coalesce(excluded.description, shop.products.description),
            highlights = case when cardinality(excluded.highlights) > 0 then excluded.highlights else shop.products.highlights end,
            hsn_code = coalesce(excluded.hsn_code, shop.products.hsn_code), gst_rate = excluded.gst_rate, is_featured = excluded.is_featured,
            updated_by = excluded.updated_by
          returning id`;
        ids.set(slug, row!.id);
        if (p.image) {
          const [has] = await tx`select 1 from shop.product_media where product_id = ${row!.id} and url = ${p.image}`;
          if (!has) await tx`insert into shop.product_media (product_id, kind, url, alt, sort_order) values (${row!.id}, 'image', ${p.image}, ${String(p.fields.name)}, (select count(*) from shop.product_media where product_id = ${row!.id}))`;
        }
      }
      for (const v of variants) {
        const productId = ids.get(v.slug) ?? existingProducts.find((p) => p.slug === v.slug)!.id;
        const existing = existingSkus.find((x) => x.sku === v.sku);
        if (existing) {
          await tx`update shop.product_variants set options = ${tx.json(v.options as never)}, price_paise = ${v.price}, mrp_paise = ${v.mrp}, weight_grams = coalesce(${v.weight}, weight_grams) where id = ${existing.id}`;
          if (v.stock !== null && v.stock !== existing.stock) {
            await tx`update shop.product_variants set stock = ${v.stock} where id = ${existing.id}`;
            await tx`insert into shop.stock_movements (variant_id, delta, stock_after, reason, note, staff_id) values (${existing.id}, ${v.stock - existing.stock}, ${v.stock}, 'import', ${file.name.slice(0, 100)}, ${s.staffId})`;
          }
        } else {
          const [nv] = await tx<{ id: string }[]>`
            insert into shop.product_variants (product_id, sku, options, price_paise, mrp_paise, stock, weight_grams, position)
            values (${productId}, ${v.sku}, ${tx.json(v.options as never)}, ${v.price}, ${v.mrp}, ${v.stock ?? 0}, ${v.weight},
                    (select count(*) from shop.product_variants where product_id = ${productId})) returning id`;
          if (v.stock) await tx`insert into shop.stock_movements (variant_id, delta, stock_after, reason, note, staff_id) values (${nv!.id}, ${v.stock}, ${v.stock}, 'import', ${file.name.slice(0, 100)}, ${s.staffId})`;
        }
      }
      for (const [slug, p] of products) if (p.status === "published") {
        const id = ids.get(slug)!;
        const problem = await publishProblems(tx, id);
        if (problem) throw new UserError(`Row ${p.row}: can’t publish “${slug}” — ${problem}`);
        await tx`update shop.products set is_active = true, publish_at = null where id = ${id}`;
      }
      await audit(s, { action: "product.import", details: { file: file.name.slice(0, 100), ...preview, errors: undefined } }, tx);
    });
    revalidatePath("/products");
    await revalidateStorefront(["/", "/categories", ...[...products.keys()].map((sl) => `/p/${sl}`)]);
    return { ok: true, preview, message: `Imported ${preview.rows} row(s): ${preview.newProducts} new and ${preview.updatedProducts} updated product(s), ${preview.newVariants} new and ${preview.updatedVariants} updated variant(s).` };
  })) as ImportResult;
}

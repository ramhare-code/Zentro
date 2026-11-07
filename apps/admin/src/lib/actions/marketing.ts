"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "../audit";
import { allowedRemoteImage, revalidateStorefront, revalidateWholeStorefront } from "../catalog-admin";
import { db } from "../db";
import { parseIstLocal } from "../ist";
import { deleteStoredImage, MediaError, storeImage } from "../media";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const on = (f: FormData, k: string) => f.get(k) === "on";
const ids = (f: FormData, k: string) => [...new Set(f.getAll(k).map(String).filter((v) => z.guid().safeParse(v).success))];

function rupees(f: FormData, k: string, label: string, opts: { required?: boolean; min?: number } = {}): number | null {
  const raw = str(f, k, 20).replace(/[₹,\s]/g, "");
  if (!raw) { if (opts.required) throw new UserError(`Enter ${label}.`); return null; }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new UserError(`${label[0]!.toUpperCase() + label.slice(1)} must be an amount in rupees.`);
  const p = Math.round(Number(raw) * 100);
  if (opts.min !== undefined && p < opts.min) throw new UserError(`${label[0]!.toUpperCase() + label.slice(1)} must be at least ₹${opts.min / 100}.`);
  return p;
}
function whole(f: FormData, k: string, label: string, min = 1, max = 1_000_000): number | null {
  const raw = str(f, k, 10);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new UserError(`${label} must be a whole number from ${min} to ${max.toLocaleString("en-IN")}.`);
  return n;
}
function when(f: FormData, k: string, label: string, required = false): Date | null {
  const d = parseIstLocal(str(f, k, 20));
  if (!d) { if (required) throw new UserError(`Choose ${label}.`); return null; }
  if (Number.isNaN(d.getTime())) throw new UserError(`${label[0]!.toUpperCase() + label.slice(1)} isn’t a valid date and time.`);
  return d;
}

/** Product slugs (one per line or comma-separated) → ids. */
async function productIdsFrom(text: string): Promise<string[]> {
  const slugs = [...new Set(text.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!slugs.length) return [];
  if (slugs.length > 200) throw new UserError("Up to 200 products per rule.");
  const rows = await db()<{ id: string; slug: string }[]>`select id, slug from shop.products where slug = any(${slugs}) and archived_at is null`;
  const missing = slugs.filter((s) => !rows.some((r) => r.slug === s));
  if (missing.length) throw new UserError(`No product with slug: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`);
  return rows.map((r) => r.id);
}

function discount(f: FormData): { type: "percent" | "fixed"; value: number } {
  const type = f.get("discountType") === "fixed" ? "fixed" : "percent";
  if (type === "percent") {
    const v = whole(f, "discountValue", "Percentage", 1, 90);
    if (v === null) throw new UserError("Enter the discount percentage (1–90).");
    return { type, value: v };
  }
  return { type, value: rupees(f, "discountValue", "the discount amount", { required: true, min: 100 })! };
}

// ------------------------------------------------------------------ coupons

export async function saveCouponAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().safeParse(f.get("couponId")).data ?? null;
    const sql = db();
    const existing = id ? (await sql<{ code: string; usedCount: number }[]>`select code, used_count as "usedCount" from shop.coupons where id = ${id}`)[0] : undefined;
    if (id && !existing) throw new UserError("Coupon not found.");
    const code = existing && existing.usedCount > 0 ? existing.code : str(f, "code", 20).toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new UserError("Codes are 3–20 letters and numbers, e.g. DIWALI10.");
    const description = str(f, "description", 160);
    if (description.length < 3) throw new UserError("Describe the offer for customers, e.g. “10% off your first order”.");
    const d = discount(f);
    const startsAt = when(f, "startsAt", "the start"), endsAt = when(f, "endsAt", "the end");
    if (startsAt && endsAt && endsAt <= startsAt) throw new UserError("The end must be after the start.");
    const appliesTo = z.enum(["all", "categories", "products"]).catch("all").parse(f.get("appliesTo"));
    const categoryIds = appliesTo === "categories" ? ids(f, "categoryIds") : [];
    const productIds = appliesTo === "products" ? await productIdsFrom(str(f, "productSlugs", 10000)) : [];
    if (appliesTo === "categories" && !categoryIds.length) throw new UserError("Choose at least one category.");
    if (appliesTo === "products" && !productIds.length) throw new UserError("List at least one product slug.");
    const row = {
      code, description, discount_type: d.type, discount_value: d.value,
      max_discount_paise: d.type === "percent" ? rupees(f, "maxDiscount", "the maximum discount", { min: 100 }) : null,
      min_order_paise: rupees(f, "minOrder", "the minimum order") ?? 0,
      starts_at: startsAt, ends_at: endsAt,
      usage_limit: whole(f, "usageLimit", "Total uses"), per_user_limit: whole(f, "perUserLimit", "Uses per customer", 1, 100),
      first_order_only: on(f, "firstOrderOnly"), applies_to: appliesTo, category_ids: categoryIds, product_ids: productIds,
      combinable: on(f, "combinable"), is_public: on(f, "isPublic"), is_active: on(f, "isActive"),
    };
    if (row.usage_limit !== null && existing && row.usage_limit < existing.usedCount) throw new UserError(`It has already been used ${existing.usedCount} time(s); the limit can’t be lower.`);
    if (!id) {
      const [dupe] = await sql`select 1 from shop.coupons where code = ${code}`;
      if (dupe) throw new UserError("That code already exists.");
    }
    const saved = id
      ? (await sql<{ id: string }[]>`update shop.coupons set ${sql(row)} where id = ${id} returning id`)[0]!.id
      : (await sql<{ id: string }[]>`insert into shop.coupons ${sql({ ...row, created_by: s.staffId })} returning id`)[0]!.id;
    await audit(s, { action: id ? "coupon.update" : "coupon.create", entityType: "coupon", entityId: saved, details: { code, ...d, appliesTo, active: row.is_active } });
    revalidatePath("/coupons");
    if (!id) redirect(`/coupons/${saved}?created=1`);
    revalidatePath(`/coupons/${saved}`);
    return { ok: true, message: "Coupon saved." };
  });
}

export async function archiveCouponAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().parse(f.get("couponId"));
    const restore = f.get("op") === "restore";
    const [c] = await db()<{ code: string }[]>`
      update shop.coupons set archived_at = ${restore ? null : new Date()}, is_active = false where id = ${id} returning code`;
    if (!c) throw new UserError("Coupon not found.");
    await audit(s, { action: restore ? "coupon.restore" : "coupon.archive", entityType: "coupon", entityId: id, details: { code: c.code } });
    revalidatePath(`/coupons/${id}`);
    revalidatePath("/coupons");
    return { ok: true, message: restore ? "Restored (inactive — switch it on when ready)." : "Archived. It can no longer be used; past orders keep it." };
  });
}

// ------------------------------------------------------------------ promotions

export async function savePromotionAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().safeParse(f.get("promotionId")).data ?? null;
    const name = str(f, "name", 80), badge = str(f, "badge", 24);
    if (name.length < 2) throw new UserError("Give the promotion a name.");
    if (badge.length < 2) throw new UserError("Enter a short badge customers will see, e.g. “Diwali Sale”.");
    const d = discount(f);
    const startsAt = when(f, "startsAt", "the start", true)!, endsAt = when(f, "endsAt", "the end", true)!;
    if (endsAt <= startsAt) throw new UserError("The end must be after the start.");
    if (endsAt.getTime() - startsAt.getTime() > 92 * 86_400_000) throw new UserError("Promotions can run for up to 92 days. Create a new one for a longer period.");
    const appliesTo = z.enum(["all", "categories", "brands", "products"]).catch("all").parse(f.get("appliesTo"));
    const row = {
      name, badge, discount_type: d.type, discount_value: d.value, applies_to: appliesTo,
      category_ids: appliesTo === "categories" ? ids(f, "categoryIds") : [],
      brand_ids: appliesTo === "brands" ? ids(f, "brandIds") : [],
      product_ids: appliesTo === "products" ? await productIdsFrom(str(f, "productSlugs", 10000)) : [],
      starts_at: startsAt, ends_at: endsAt, is_active: on(f, "isActive"),
    };
    if (appliesTo === "categories" && !row.category_ids.length) throw new UserError("Choose at least one category.");
    if (appliesTo === "brands" && !row.brand_ids.length) throw new UserError("Choose at least one brand.");
    if (appliesTo === "products" && !row.product_ids.length) throw new UserError("List at least one product slug.");

    const sql = db();
    // never sell below cost by accident
    const [risk] = await sql<{ below: number; sample: string | null }[]>`
      with v as (
        select v.sku, v.cost_paise as cost,
               greatest(100, v.price_paise - case when ${d.type} = 'percent' then (v.price_paise::bigint * ${d.value} / 100)::int else ${d.value} end) as sale
        from shop.product_variants v join shop.products p on p.id = v.product_id
        where v.is_active and p.archived_at is null and (${appliesTo} = 'all'
          or (${appliesTo} = 'products' and p.id = any(${row.product_ids}::uuid[]))
          or (${appliesTo} = 'brands' and p.brand_id = any(${row.brand_ids}::uuid[]))
          or (${appliesTo} = 'categories' and ${row.category_ids}::uuid[] && shop.category_path(p.category_id))))
      select count(*) filter (where cost is not null and sale < cost)::int as below,
             string_agg(sku, ', ' order by sku) filter (where cost is not null and sale < cost) as sample from v`;
    if (risk!.below > 0 && !on(f, "allowBelowCost")) {
      throw new UserError(`${risk!.below} item(s) would sell below their cost price (${risk!.sample!.split(", ").slice(0, 5).join(", ")}${risk!.below > 5 ? "…" : ""}). Lower the discount, or tick “Allow selling below cost” to confirm.`);
    }
    const saved = id
      ? (await sql<{ id: string }[]>`update shop.promotions set ${sql(row)} where id = ${id} returning id`)[0]?.id
      : (await sql<{ id: string }[]>`insert into shop.promotions ${sql({ ...row, created_by: s.staffId })} returning id`)[0]!.id;
    if (!saved) throw new UserError("Promotion not found.");
    await audit(s, { action: id ? "promotion.update" : "promotion.create", entityType: "promotion", entityId: saved, details: { name, ...d, appliesTo, startsAt, endsAt, active: row.is_active, belowCost: risk!.below } });
    await revalidateWholeStorefront();
    revalidatePath("/promotions");
    if (!id) redirect(`/promotions/${saved}?created=1`);
    revalidatePath(`/promotions/${saved}`);
    return { ok: true, message: "Promotion saved. Storefront prices update within a few minutes; checkout uses the new price immediately." };
  });
}

export async function endPromotionAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().parse(f.get("promotionId"));
    const [p] = await db()<{ name: string }[]>`
      update shop.promotions set ends_at = greatest(starts_at + interval '1 second', least(ends_at, now())), is_active = false where id = ${id} returning name`;
    if (!p) throw new UserError("Promotion not found.");
    await audit(s, { action: "promotion.end", entityType: "promotion", entityId: id, details: { name: p.name } });
    await revalidateWholeStorefront();
    revalidatePath(`/promotions/${id}`);
    revalidatePath("/promotions");
    return { ok: true, message: "Promotion ended. Prices are back to normal." };
  });
}

// ------------------------------------------------------------------ banners

async function bannerImage(f: FormData, field: string, urlField: string, staffId: string): Promise<{ url: string; key: string | null } | null> {
  const file = f.get(field);
  if (file instanceof File && file.size > 0) {
    try { const m = await storeImage(file, staffId); return { url: m.url, key: m.key }; }
    catch (e) { if (e instanceof MediaError) throw new UserError(e.message); throw e; }
  }
  const url = str(f, urlField, 500);
  if (!url) return null;
  if (!allowedRemoteImage(url)) throw new UserError("Image links must be https from an approved image host — or upload the file instead.");
  return { url, key: null };
}

export async function saveBannerAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().safeParse(f.get("bannerId")).data ?? null;
    const sql = db();
    const [prev] = id ? await sql<{ imageUrl: string; storageKey: string | null; mobileKey: string | null; categoryId: string | null }[]>`
      select image_url as "imageUrl", storage_key as "storageKey", mobile_storage_key as "mobileKey", category_id as "categoryId" from shop.banners where id = ${id}` : [];
    if (id && !prev) throw new UserError("Banner not found.");
    const title = str(f, "title", 80);
    if (title.length < 2) throw new UserError("Enter a headline.");
    const ctaHref = str(f, "ctaHref", 200) || null;
    if (ctaHref && !/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(ctaHref)) throw new UserError("The link must be a page on your store, starting with “/”, e.g. /c/electronics.");
    const placement = f.get("placement") === "category" ? "category" : "home";
    const categoryId = placement === "category" ? z.guid().safeParse(f.get("categoryId")).data ?? null : null;
    if (placement === "category" && !categoryId) throw new UserError("Choose the category page this banner appears on.");
    const startsAt = when(f, "startsAt", "the start"), endsAt = when(f, "endsAt", "the end");
    if (startsAt && endsAt && endsAt <= startsAt) throw new UserError("The end must be after the start.");
    const alt = str(f, "alt", 160);
    if (alt.length < 3) throw new UserError("Describe the image for screen-reader users (alt text).");
    const image = await bannerImage(f, "image", "imageUrl", s.staffId);
    if (!image && !prev) throw new UserError("Add an image (at least 1600 × 600 works well).");
    const mobile = await bannerImage(f, "imageMobile", "imageMobileUrl", s.staffId);
    const row = {
      title, subtitle: str(f, "subtitle", 160) || null, cta_label: str(f, "ctaLabel", 30) || null, cta_href: ctaHref,
      theme: f.get("theme") === "light" ? "light" : "dark", placement, category_id: categoryId, alt,
      starts_at: startsAt, ends_at: endsAt, sort_order: whole(f, "sortOrder", "Order", 0, 1000) ?? 0, is_active: on(f, "isActive"),
      ...(image ? { image_url: image.url, storage_key: image.key } : {}),
      ...(mobile ? { image_mobile_url: mobile.url, mobile_storage_key: mobile.key } : {}),
      ...(f.get("removeMobile") === "on" && !mobile ? { image_mobile_url: null, mobile_storage_key: null } : {}),
    };
    const saved = id
      ? (await sql<{ id: string }[]>`update shop.banners set ${sql(row)} where id = ${id} returning id`)[0]!.id
      : (await sql<{ id: string }[]>`insert into shop.banners ${sql({ ...row, created_by: s.staffId })} returning id`)[0]!.id;
    // replaced uploads are deleted once the new one is saved
    if (prev && image && prev.storageKey) await deleteStoredImage(prev.storageKey);
    if (prev && (mobile || f.get("removeMobile") === "on") && prev.mobileKey) await deleteStoredImage(prev.mobileKey);
    await audit(s, { action: id ? "banner.update" : "banner.create", entityType: "banner", entityId: saved, details: { title, placement, active: row.is_active } });
    const slugs = await sql<{ slug: string }[]>`select slug from shop.categories where id = any(${[categoryId, prev?.categoryId].filter(Boolean) as string[]}::uuid[])`;
    await revalidateStorefront(["/", ...slugs.map((c) => `/c/${c.slug}`)]);
    revalidatePath("/banners");
    if (!id) redirect(`/banners/${saved}?created=1`);
    revalidatePath(`/banners/${saved}`);
    return { ok: true, message: "Banner saved." };
  });
}

export async function deleteBannerAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().parse(f.get("bannerId"));
    const [b] = await db()<{ title: string; storageKey: string | null; mobileKey: string | null }[]>`
      delete from shop.banners where id = ${id} returning title, storage_key as "storageKey", mobile_storage_key as "mobileKey"`;
    if (!b) throw new UserError("Banner not found.");
    await deleteStoredImage(b.storageKey);
    await deleteStoredImage(b.mobileKey);
    await audit(s, { action: "banner.delete", entityType: "banner", entityId: id, details: { title: b.title } });
    await revalidateStorefront(["/"]);
    redirect("/banners?deleted=1");
  });
}

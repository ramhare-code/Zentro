"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "../audit";
import { allowedRemoteImage, revalidateStorefront } from "../catalog-admin";
import { slugify } from "../csv";
import { db } from "../db";
import { MediaError, storeImage } from "../media";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function imageFrom(f: FormData, field: string, urlField: string, staffId: string): Promise<string | null | undefined> {
  const file = f.get(field);
  if (file instanceof File && file.size > 0) {
    try { return (await storeImage(file, staffId)).url; } catch (e) { if (e instanceof MediaError) throw new UserError(e.message); throw e; }
  }
  const url = str(f, urlField, 1000);
  if (url) { if (!allowedRemoteImage(url)) throw new UserError("Image links must be https and from an approved image host."); return url; }
  return undefined; // unchanged
}

// ------------------------------------------------------------------ categories

export async function saveCategoryAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("catalog.manage");
    const id = z.guid().safeParse(f.get("categoryId")).data ?? null;
    const name = str(f, "name", 80);
    if (name.length < 2) throw new UserError("Give the category a name.");
    const slug = str(f, "slug", 80) || slugify(name);
    if (!SLUG.test(slug)) throw new UserError("The URL slug can contain lowercase letters, numbers and hyphens.");
    const parentId = z.guid().safeParse(f.get("parentId")).data ?? null;
    const sortOrder = z.coerce.number().int().min(-1000).max(100000).safeParse(str(f, "sortOrder") || "0").data ?? 0;
    const when = str(f, "publishAt");
    const publishAt = when ? new Date(when + ":00+05:30") : null;
    if (publishAt && Number.isNaN(publishAt.getTime())) throw new UserError("Invalid visibility date.");
    const sql = db();
    const image = await imageFrom(f, "imageFile", "imageUrl", s.staffId);
    const oldSlug = id ? (await sql<{ slug: string }[]>`select slug from shop.categories where id = ${id}`)[0]?.slug : undefined;
    await sql.begin(async (tx) => {
      const [dupe] = await tx`select 1 from shop.categories where slug = ${slug} and id is distinct from ${id}`;
      if (dupe) throw new UserError("Another category already uses this URL slug.");
      const [dupeName] = await tx`select 1 from shop.categories where lower(name) = lower(${name}) and parent_id is not distinct from ${parentId} and id is distinct from ${id}`;
      if (dupeName) throw new UserError("A category with this name already exists at this level.");
      if (parentId) {
        if (parentId === id) throw new UserError("A category can’t be inside itself.");
        if (id) {
          // the new parent must not be one of this category's descendants
          const [cycle] = await tx`with recursive d as (select id from shop.categories where parent_id = ${id} union all select c.id from shop.categories c join d on c.parent_id = d.id) select 1 from d where id = ${parentId}`;
          if (cycle) throw new UserError("A category can’t be moved inside one of its own subcategories.");
        }
        const [{ depth }] = (await tx<{ depth: number }[]>`with recursive up as (select id, parent_id, 1 as depth from shop.categories where id = ${parentId} union all select c.id, c.parent_id, up.depth + 1 from shop.categories c join up on c.id = up.parent_id) select max(depth)::int as depth from up`) as unknown as [{ depth: number }];
        if (depth >= 3) throw new UserError("Categories can be nested at most three levels deep.");
      }
      const row: Record<string, unknown> = {
        name, slug, parent_id: parentId, description: str(f, "description", 500) || null, sort_order: sortOrder,
        is_active: f.get("isActive") === "on", publish_at: publishAt,
        seo_title: str(f, "seoTitle", 70) || null, seo_description: str(f, "seoDescription", 170) || null, noindex: f.get("noindex") === "on",
      };
      if (image !== undefined) row.image_url = image;
      if (id) await tx`update shop.categories set ${tx(row as never)} where id = ${id}`;
      else await tx`insert into shop.categories ${tx(row as never)}`;
      await audit(s, { action: id ? "category.update" : "category.create", entityType: "category", entityId: id ?? slug, details: { name, slug, active: row.is_active } }, tx);
    });
    revalidatePath("/categories");
    await revalidateStorefront(["/", "/categories", `/c/${slug}`, ...(oldSlug && oldSlug !== slug ? [`/c/${oldSlug}`] : [])]);
    return { ok: true, message: id ? "Category saved." : "Category created." };
  });
}

export async function categoryOpAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("catalog.manage");
    const id = z.guid().parse(f.get("categoryId"));
    const op = z.enum(["up", "down", "delete"]).parse(f.get("op"));
    const sql = db();
    let message = "";
    await sql.begin(async (tx) => {
      const [c] = await tx<{ parentId: string | null; slug: string }[]>`select parent_id as "parentId", slug from shop.categories where id = ${id} for update`;
      if (!c) throw new UserError("Category not found.");
      if (op === "delete") {
        const [u] = await tx<{ products: number; children: number }[]>`
          select (select count(*)::int from shop.products where category_id = ${id}) as products, (select count(*)::int from shop.categories where parent_id = ${id}) as children`;
        if (u!.children) throw new UserError(`It has ${u!.children} subcategor${u!.children === 1 ? "y" : "ies"}. Move or delete them first.`);
        if (u!.products) throw new UserError(`${u!.products} product(s) use this category (including archived ones). Move them first, or hide the category instead.`);
        await tx`delete from shop.categories where id = ${id}`;
        message = "Category deleted.";
      } else {
        const siblings = await tx<{ id: string }[]>`select id from shop.categories where parent_id is not distinct from ${c.parentId} order by sort_order, name for update`;
        const i = siblings.findIndex((x) => x.id === id), j = op === "up" ? i - 1 : i + 1;
        if (j >= 0 && j < siblings.length) {
          [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
          for (const [k, x] of siblings.entries()) await tx`update shop.categories set sort_order = ${k * 10} where id = ${x.id}`;
        }
        message = "Order updated.";
      }
      await audit(s, { action: `category.${op}`, entityType: "category", entityId: id }, tx);
    });
    revalidatePath("/categories");
    await revalidateStorefront(["/", "/categories"]);
    return { ok: true, message };
  });
}

// ------------------------------------------------------------------ brands

export async function saveBrandAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("catalog.manage");
    const id = z.guid().safeParse(f.get("brandId")).data ?? null;
    const name = str(f, "name", 80);
    if (name.length < 2) throw new UserError("Give the brand a name.");
    const slug = str(f, "slug", 80) || slugify(name);
    if (!SLUG.test(slug)) throw new UserError("The URL slug can contain lowercase letters, numbers and hyphens.");
    const logo = await imageFrom(f, "logoFile", "logoUrl", s.staffId);
    const sql = db();
    await sql.begin(async (tx) => {
      const [dupe] = await tx`select 1 from shop.brands where (slug = ${slug} or lower(name) = lower(${name})) and id is distinct from ${id}`;
      if (dupe) throw new UserError("A brand with this name or slug already exists.");
      const row: Record<string, unknown> = { name, slug, is_active: f.get("isActive") !== null ? f.get("isActive") === "on" : true, updated_at: new Date() };
      if (logo !== undefined) row.logo_url = logo;
      if (id) await tx`update shop.brands set ${tx(row as never)} where id = ${id}`;
      else await tx`insert into shop.brands ${tx(row as never)}`;
      await audit(s, { action: id ? "brand.update" : "brand.create", entityType: "brand", entityId: id ?? slug, details: { name, active: row.is_active } }, tx);
    });
    revalidatePath("/brands");
    await revalidateStorefront(["/", "/search"]);
    return { ok: true, message: id ? "Brand saved." : "Brand added." };
  });
}

export async function deleteBrandAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("catalog.manage");
    const id = z.guid().parse(f.get("brandId"));
    const sql = db();
    const [u] = await sql<{ n: number }[]>`select count(*)::int as n from shop.products where brand_id = ${id}`;
    if (u!.n) throw new UserError(`${u!.n} product(s) use this brand. Archive the brand instead, or reassign them first.`);
    await sql`delete from shop.brands where id = ${id}`;
    await audit(s, { action: "brand.delete", entityType: "brand", entityId: id });
    revalidatePath("/brands");
    return { ok: true, message: "Brand deleted." };
  });
}

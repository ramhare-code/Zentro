import "server-only";
import { db } from "./db";

export type ProductStatus = "draft" | "scheduled" | "published" | "archived";
export const STATUS_SQL = `case when p.archived_at is not null then 'archived' when not p.is_active then 'draft'
  when p.publish_at > now() then 'scheduled' else 'published' end`;

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;
export const STOCK_REASONS = {
  correction: "Count correction", received: "Stock received", damaged: "Damaged", lost: "Lost / missing",
  returned_to_supplier: "Returned to supplier", reconciliation: "Reconciliation", other: "Other",
} as const;

export interface AdminProductRow {
  id: string; slug: string; name: string; status: ProductStatus; categoryName: string; brandName: string | null;
  isFeatured: boolean; variants: number; stock: number; minPrice: number | null; imageUrl: string | null; updatedAt: Date;
}

export async function listAdminProducts(f: { q?: string; status?: ProductStatus; categoryId?: string; brandId?: string; stock?: "out" | "low"; page: number }) {
  const sql = db();
  const like = f.q ? `%${f.q.toLowerCase().replace(/[%_\\]/g, "")}%` : null;
  const rows = await sql<(AdminProductRow & { full: number })[]>`
    select p.id, p.slug, p.name, ${sql.unsafe(STATUS_SQL)} as status, c.name as "categoryName", b.name as "brandName",
           p.is_featured as "isFeatured", count(v.id)::int as variants, coalesce(sum(v.stock) filter (where v.is_active), 0)::int as stock,
           min(v.price_paise) filter (where v.is_active) as "minPrice",
           (select url from shop.product_media m where m.product_id = p.id and m.kind = 'image' order by sort_order limit 1) as "imageUrl",
           p.updated_at as "updatedAt", count(*) over ()::int as full
    from shop.products p
    join shop.categories c on c.id = p.category_id
    left join shop.brands b on b.id = p.brand_id
    left join shop.product_variants v on v.product_id = p.id
    where true
      ${like ? sql`and (lower(p.name) like ${like} or p.slug like ${like} or exists (select 1 from shop.product_variants x where x.product_id = p.id and lower(x.sku) like ${like}))` : sql``}
      ${f.status ? sql`and ${sql.unsafe(STATUS_SQL)} = ${f.status}` : sql``}
      ${f.categoryId ? sql`and p.category_id in (with recursive t as (select id from shop.categories where id = ${f.categoryId} union all select k.id from shop.categories k join t on k.parent_id = t.id) select id from t)` : sql``}
      ${f.brandId ? sql`and p.brand_id = ${f.brandId}` : sql``}
    group by p.id, c.name, b.name
    having true
      ${f.stock === "out" ? sql`and coalesce(sum(v.stock) filter (where v.is_active), 0) = 0` : sql``}
      ${f.stock === "low" ? sql`and bool_or(v.is_active and v.stock > 0 and v.stock <= v.low_stock_threshold)` : sql``}
    order by p.updated_at desc
    limit 50 offset ${(f.page - 1) * 50}`;
  return { rows, total: rows[0]?.full ?? 0 };
}

export interface ProductForEdit {
  id: string; slug: string; name: string; status: ProductStatus; brandId: string | null; categoryId: string;
  shortDescription: string | null; description: string | null; highlights: string[];
  specifications: { group: string; items: { label: string; value: string }[] }[];
  hsnCode: string | null; gstRate: string; isFeatured: boolean; publishAt: Date | null; seoTitle: string | null; seoDescription: string | null;
  ratingAvg: number; ratingCount: number; unitsSold: number; createdAt: Date; updatedAt: Date;
  variants: { id: string; sku: string; options: Record<string, string>; pricePaise: number; mrpPaise: number; stock: number; lowStockThreshold: number; weightGrams: number | null; mediaId: string | null; isActive: boolean; ordered: boolean }[];
  media: { id: string; kind: "image" | "video"; url: string; posterUrl: string | null; alt: string; width: number | null; height: number | null; sortOrder: number }[];
}

export async function getProductForEdit(id: string): Promise<ProductForEdit | null> {
  const sql = db();
  const [p] = await sql<Omit<ProductForEdit, "variants" | "media">[]>`
    select p.id, p.slug, p.name, ${sql.unsafe(STATUS_SQL)} as status, p.brand_id as "brandId", p.category_id as "categoryId",
           p.short_description as "shortDescription", p.description, p.highlights, p.specifications, p.hsn_code as "hsnCode",
           p.gst_rate::text as "gstRate", p.is_featured as "isFeatured", p.publish_at as "publishAt", p.seo_title as "seoTitle",
           p.seo_description as "seoDescription", p.rating_avg::float8 as "ratingAvg", p.rating_count as "ratingCount",
           p.units_sold as "unitsSold", p.created_at as "createdAt", p.updated_at as "updatedAt"
    from shop.products p where p.id = ${id}`;
  if (!p) return null;
  const [variants, media] = await Promise.all([
    sql<ProductForEdit["variants"]>`
      select v.id, v.sku, v.options, v.price_paise as "pricePaise", v.mrp_paise as "mrpPaise", v.stock, v.low_stock_threshold as "lowStockThreshold",
             v.weight_grams as "weightGrams", v.media_id as "mediaId", v.is_active as "isActive",
             exists (select 1 from shop.order_items i where i.variant_id = v.id) as ordered
      from shop.product_variants v where v.product_id = ${id} order by v.position, v.created_at`,
    sql<ProductForEdit["media"]>`
      select id, kind, url, poster_url as "posterUrl", alt, width, height, sort_order as "sortOrder"
      from shop.product_media where product_id = ${id} order by sort_order, created_at`,
  ]);
  return { ...p, variants, media };
}

export async function catalogOptions() {
  const sql = db();
  const [categories, brands] = await Promise.all([
    sql<{ id: string; name: string; parentId: string | null; isActive: boolean }[]>`
      select id, name, parent_id as "parentId", is_active as "isActive" from shop.categories order by sort_order, name`,
    sql<{ id: string; name: string; isActive: boolean }[]>`select id, name, is_active as "isActive" from shop.brands order by name`,
  ]);
  // indented labels for the category tree
  const label = (id: string): string => {
    const c = categories.find((x) => x.id === id);
    if (!c) return "";
    return c.parentId ? `${label(c.parentId)} › ${c.name}` : c.name;
  };
  return { categories: categories.map((c) => ({ ...c, label: label(c.id) })).sort((a, b) => a.label.localeCompare(b.label)), brands };
}

/** "Group | Label | Value" or "Label: Value" lines → grouped specifications. */
export function parseSpecs(text: string): { group: string; items: { label: string; value: string }[] }[] | string {
  const groups = new Map<string, { label: string; value: string }[]>();
  for (const [n, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    let group = "General", label: string | undefined, value: string | undefined;
    if (line.includes("|")) [group = "General", label, value] = line.split("|").map((s) => s.trim());
    else if (line.includes(":")) { const i = line.indexOf(":"); label = line.slice(0, i).trim(); value = line.slice(i + 1).trim(); }
    if (!label || !value) return `Specification line ${n + 1} should look like “Label: Value” or “Group | Label | Value”.`;
    if (label.length > 60 || value.length > 200 || group.length > 40) return `Specification line ${n + 1} is too long.`;
    groups.set(group, [...(groups.get(group) ?? []), { label, value }]);
  }
  if ([...groups.values()].flat().length > 60) return "At most 60 specification rows.";
  return [...groups].map(([group, items]) => ({ group, items }));
}

export function specsToText(specs: ProductForEdit["specifications"]): string {
  return specs.flatMap((g) => g.items.map((i) => (g.group === "General" ? `${i.label}: ${i.value}` : `${g.group} | ${i.label} | ${i.value}`))).join("\n");
}

/** Hosts whose image URLs may be referenced without uploading (must also be allowed by the storefront). */
export function allowedRemoteImage(url: string): boolean {
  try {
    const u = new URL(url);
    const hosts = (process.env.MEDIA_REMOTE_HOSTS ?? "images.unsplash.com").split(",").map((h) => h.trim()).filter(Boolean);
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
    return u.protocol === "https:" && (hosts.includes(u.hostname) || u.hostname === supabase);
  } catch {
    return false;
  }
}

/** Asks the storefront to refresh every cached page (e.g. prices changed by a promotion). Best effort. */
export async function revalidateWholeStorefront() {
  const base = process.env.STOREFRONT_URL, secret = process.env.REVALIDATE_SECRET;
  if (!base || !secret) return;
  await fetch(`${base.replace(/\/$/, "")}/api/revalidate?all=1`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}

/** Asks the storefront to refresh cached pages after catalogue changes. Best effort. */
export async function revalidateStorefront(paths: string[]) {
  const base = process.env.STOREFRONT_URL, secret = process.env.REVALIDATE_SECRET;
  if (!base || !secret) return;
  await Promise.all([...new Set(paths)].map((p) =>
    fetch(`${base.replace(/\/$/, "")}/api/revalidate?path=${encodeURIComponent(p)}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000) }).catch(() => {}),
  ));
}

export const IMPORT_COLUMNS = ["slug", "name", "category_slug", "brand", "short_description", "description", "highlights", "hsn_code", "gst_rate", "sku", "options", "price", "mrp", "stock", "weight_grams", "image_url", "status", "featured"] as const;

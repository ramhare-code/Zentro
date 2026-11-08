import "server-only";
import type { StorySection } from "@zentro/commerce/product-media";
import { cache } from "react";
import { db } from "./db";
import { PAGE_SIZE, queryTokens, type ListingFilters } from "./listing-params";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  categorySlug: string;
  categoryName: string;
  brandSlug: string | null;
  brandName: string | null;
  ratingAvg: number;
  ratingCount: number;
  minPricePaise: number;
  maxPricePaise: number;
  mrpPaise: number;
  totalStock: number;
  variantCount: number;
  imageUrl: string | null;
  imageAlt: string | null;
  /** Running promotion, e.g. "Diwali Sale" (price already reflects it). */
  promotionBadge: string | null;
}

export interface Category {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string;
  imageMobileUrl: string | null;
  theme: "dark" | "light";
}

export interface Media {
  id: string;
  kind: "image" | "video" | "youtube";
  url: string;
  posterUrl: string | null;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface Variant {
  id: string;
  sku: string;
  options: Record<string, string>;
  pricePaise: number;
  /** Price before a running promotion (equal to pricePaise when none). */
  basePricePaise: number;
  mrpPaise: number;
  stock: number;
  mediaId: string | null;
  promotionBadge: string | null;
  promotionEndsAt: Date | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  highlights: string[];
  specifications: { group: string; items: { label: string; value: string }[] }[];
  brand: { slug: string; name: string } | null;
  category: Category;
  breadcrumbs: Category[];
  ratingAvg: number;
  ratingCount: number;
  ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  seoTitle: string | null;
  seoDescription: string | null;
  media: Media[];
  variants: Variant[];
  optionNames: string[];
  updatedAt: string;
  boxContents: string[];
  warranty: string | null;
  countryOfOrigin: string | null;
  manufacturerInfo: string | null;
  careInstructions: string | null;
  brandStory: StorySection[];
}

export interface ListingResult {
  products: ProductSummary[];
  total: number;
  page: number;
  pageCount: number;
  facets: {
    brands: { slug: string; name: string; count: number }[];
    priceMinPaise: number | null;
    priceMaxPaise: number | null;
  };
  correctedQuery?: string;
}

// Selected columns of shop.product_listing, mapped to ProductSummary.
const SUMMARY_COLUMNS = `
  pl.id, pl.slug, pl.name,
  pl.short_description   as "shortDescription",
  pl.category_slug       as "categorySlug",
  pl.category_name       as "categoryName",
  pl.brand_slug          as "brandSlug",
  pl.brand_name          as "brandName",
  pl.rating_avg::float8  as "ratingAvg",
  pl.rating_count        as "ratingCount",
  pl.min_price_paise     as "minPricePaise",
  pl.max_price_paise     as "maxPricePaise",
  pl.mrp_paise           as "mrpPaise",
  pl.total_stock         as "totalStock",
  pl.variant_count       as "variantCount",
  pl.image_url           as "imageUrl",
  pl.image_alt           as "imageAlt",
  pl.promotion_badge     as "promotionBadge"`;

// ---------------------------------------------------------------------
// Categories, banners, homepage
// ---------------------------------------------------------------------

export const getCategories = cache(async (): Promise<Category[]> => {
  return db()<Category[]>`
    select id, parent_id as "parentId", slug, name, description, image_url as "imageUrl",
           seo_title as "seoTitle", seo_description as "seoDescription", noindex
    from shop.categories
    where shop.category_live(is_active, publish_at)
    order by sort_order, name`;
});

export async function getCategoryBySlug(slug: string): Promise<{ category: Category; trail: Category[]; children: Category[] } | null> {
  const all = await getCategories();
  const category = all.find((c) => c.slug === slug);
  if (!category) return null;
  const trail: Category[] = [];
  let cursor: Category | undefined = category;
  while (cursor) {
    trail.unshift(cursor);
    const parentId: string | null = cursor.parentId;
    cursor = parentId ? all.find((c) => c.id === parentId) : undefined;
  }
  return { category, trail, children: all.filter((c) => c.parentId === category.id) };
}

export async function getActiveBanners(): Promise<Banner[]> {
  return db()<Banner[]>`
    select id, title, subtitle, cta_label as "ctaLabel", cta_href as "ctaHref",
           image_url as "imageUrl", image_mobile_url as "imageMobileUrl", theme
    from shop.banners
    where is_active and placement = 'home'
      and (starts_at is null or starts_at <= now())
      and (ends_at   is null or ends_at   >  now())
    order by sort_order, created_at desc
    limit 6`;
}

/** Banners for a category page: its own, or the nearest parent's. */
export async function getCategoryBanners(categoryId: string): Promise<Banner[]> {
  return db()<Banner[]>`
    select b.id, b.title, b.subtitle, b.cta_label as "ctaLabel", b.cta_href as "ctaHref",
           b.image_url as "imageUrl", b.image_mobile_url as "imageMobileUrl", b.theme
    from shop.banners b
    join lateral (select array_position(shop.category_path(${categoryId}), b.category_id) as depth) d on d.depth is not null
    where b.is_active and b.placement = 'category'
      and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now())
    order by d.depth, b.sort_order, b.created_at desc
    limit 3`;
}

export async function getHomeRails() {
  const sql = db();
  const cols = sql.unsafe(SUMMARY_COLUMNS);
  const [featured, deals, bestsellers, newest] = await Promise.all([
    sql<ProductSummary[]>`select ${cols} from shop.product_listing pl
      where pl.is_featured order by pl.total_stock > 0 desc, pl.units_sold desc, pl.created_at desc limit 8`,
    sql<ProductSummary[]>`select ${cols} from shop.product_listing pl
      where pl.mrp_paise > pl.min_price_paise and pl.total_stock > 0
      order by (pl.mrp_paise - pl.min_price_paise)::float / pl.mrp_paise desc limit 8`,
    sql<ProductSummary[]>`select ${cols} from shop.product_listing pl
      where pl.total_stock > 0
      order by pl.units_sold desc, pl.rating_count desc, pl.created_at desc limit 8`,
    sql<ProductSummary[]>`select ${cols} from shop.product_listing pl
      order by pl.created_at desc limit 8`,
  ]);
  return { featured, deals, bestsellers, newest };
}

// ---------------------------------------------------------------------
// Listing & search
// ---------------------------------------------------------------------

/** Prefix tsquery from sanitised tokens, e.g. "head phon" → "head:* & phon:*". */
function prefixTsQuery(q: string): string | null {
  const tokens = queryTokens(q);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

export async function listProducts(f: ListingFilters): Promise<ListingResult> {
  const sql = db();
  const tsq = f.q ? prefixTsQuery(f.q) : null;
  const qLower = f.q?.toLowerCase() ?? null;

  // Scope = category + text query. Facets are computed within the scope
  // (ignoring the brand/price filters themselves) so options stay visible.
  const scope = sql`
    ${f.category ? sql`and pl.category_id in (
        with recursive tree as (
          select id from shop.categories where slug = ${f.category} and shop.category_live(is_active, publish_at)
          union all
          select c.id from shop.categories c join tree on c.parent_id = tree.id where shop.category_live(c.is_active, c.publish_at)
        ) select id from tree)` : sql``}
    ${f.q ? sql`and (
        (${tsq}::text is not null and (
            pl.search_vector @@ to_tsquery('simple', ${tsq})
         or to_tsvector('simple', coalesce(pl.brand_name, '') || ' ' || pl.category_name) @@ to_tsquery('simple', ${tsq})))
        or extensions.word_similarity(${qLower}, lower(pl.name)) >= 0.45
        or extensions.word_similarity(${qLower}, lower(coalesce(pl.brand_name, '') || ' ' || pl.category_name)) >= 0.5
      )` : sql``}`;

  const filters = sql`
    ${f.brands.length ? sql`and pl.brand_slug = any(${f.brands}::text[])` : sql``}
    ${f.minPrice !== undefined ? sql`and pl.min_price_paise >= ${f.minPrice * 100}` : sql``}
    ${f.maxPrice !== undefined ? sql`and pl.min_price_paise <= ${f.maxPrice * 100}` : sql``}
    ${f.minRating ? sql`and pl.rating_count > 0 and pl.rating_avg >= ${f.minRating}` : sql``}
    ${f.inStock ? sql`and pl.total_stock > 0` : sql``}`;

  const relevance = f.q
    ? sql`(case when ${tsq}::text is null then 0 else ts_rank(pl.search_vector, to_tsquery('simple', ${tsq})) end
          + extensions.word_similarity(${qLower}, lower(pl.name)))`
    : sql`0`;

  const order = {
    relevance: sql`${relevance} desc, pl.units_sold desc`,
    popularity: sql`pl.units_sold desc, pl.rating_count desc, pl.created_at desc`,
    price_asc: sql`pl.min_price_paise asc`,
    price_desc: sql`pl.min_price_paise desc`,
    rating: sql`pl.rating_avg desc, pl.rating_count desc`,
    newest: sql`pl.created_at desc`,
  }[f.sort];

  const offset = (f.page - 1) * PAGE_SIZE;

  const [rows, brandFacets, priceFacet] = await Promise.all([
    sql<(ProductSummary & { fullCount: number })[]>`
      select ${sql.unsafe(SUMMARY_COLUMNS)}, count(*) over ()::int as "fullCount"
      from shop.product_listing pl
      where true ${scope} ${filters}
      order by pl.total_stock > 0 desc, ${order}, pl.id
      limit ${PAGE_SIZE} offset ${offset}`,
    sql<{ slug: string; name: string; count: number }[]>`
      select pl.brand_slug as slug, pl.brand_name as name, count(*)::int as count
      from shop.product_listing pl
      where pl.brand_slug is not null ${scope}
      group by pl.brand_slug, pl.brand_name
      order by pl.brand_name`,
    sql<{ min: number | null; max: number | null }[]>`
      select min(pl.min_price_paise) as min, max(pl.min_price_paise) as max
      from shop.product_listing pl where true ${scope}`,
  ]);

  const total = rows[0]?.fullCount ?? 0;
  const result: ListingResult = {
    products: rows.map(({ fullCount: _fc, ...p }) => p),
    total,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets: {
      brands: brandFacets,
      priceMinPaise: priceFacet[0]?.min ?? null,
      priceMaxPaise: priceFacet[0]?.max ?? null,
    },
  };

  if (f.q && total === 0) {
    const corrected = await suggestCorrection(f.q);
    if (corrected) result.correctedQuery = corrected;
  }
  return result;
}

/** "wireles hedphones" → "wireless headphones", using the catalogue's own vocabulary. */
export async function suggestCorrection(q: string): Promise<string | null> {
  const tokens = queryTokens(q);
  if (!tokens.length) return null;
  const rows = await db()<{ token: string; term: string | null }[]>`
    select t.token, (
      select v.term from shop.search_vocabulary v
      where extensions.similarity(v.term, t.token) >= 0.2
      order by v.term = t.token desc, extensions.similarity(v.term, t.token) desc
      limit 1
    ) as term
    from unnest(${tokens}::text[]) with ordinality as t(token, n)
    order by t.n`;
  const corrected = rows.map((r) => r.term ?? r.token).join(" ");
  return corrected !== tokens.join(" ") && rows.some((r) => r.term) ? corrected : null;
}

export interface Suggestion {
  products: { slug: string; name: string; imageUrl: string | null; minPricePaise: number }[];
  categories: { slug: string; name: string }[];
  correctedQuery?: string;
}

export async function autocomplete(q: string): Promise<Suggestion> {
  const sql = db();
  const tsq = prefixTsQuery(q);
  const qLower = q.toLowerCase();
  const [products, categories] = await Promise.all([
    sql<Suggestion["products"]>`
      select pl.slug, pl.name, pl.image_url as "imageUrl", pl.min_price_paise as "minPricePaise"
      from shop.product_listing pl
      where (${tsq}::text is not null and pl.search_vector @@ to_tsquery('simple', ${tsq}))
         or extensions.word_similarity(${qLower}, lower(pl.name)) >= 0.45
         or lower(coalesce(pl.brand_name, '')) like ${qLower + "%"}
      order by (lower(pl.name) like ${qLower + "%"}) desc,
               extensions.word_similarity(${qLower}, lower(pl.name)) desc,
               pl.units_sold desc
      limit 6`,
    sql<Suggestion["categories"]>`
      select slug, name from shop.categories
      where shop.category_live(is_active, publish_at) and (lower(name) like ${"%" + qLower + "%"} or extensions.word_similarity(${qLower}, lower(name)) >= 0.5)
      order by sort_order limit 4`,
  ]);
  const result: Suggestion = { products, categories };
  if (!products.length && !categories.length) {
    const corrected = await suggestCorrection(q);
    if (corrected) result.correctedQuery = corrected;
  }
  return result;
}

// ---------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------

export const getProductBySlug = cache(async (slug: string): Promise<ProductDetail | null> => {
  const sql = db();
  const [p] = await sql<
    {
      id: string; slug: string; name: string; shortDescription: string | null; description: string | null;
      highlights: string[]; specifications: ProductDetail["specifications"]; categoryId: string;
      brandSlug: string | null; brandName: string | null; ratingAvg: number; ratingCount: number; updatedAt: Date;
      seoTitle: string | null; seoDescription: string | null;
      boxContents: string[]; warranty: string | null; countryOfOrigin: string | null; manufacturerInfo: string | null;
      careInstructions: string | null; brandStory: StorySection[];
    }[]
  >`
    select p.id, p.slug, p.name, p.short_description as "shortDescription", p.description,
           p.highlights, p.specifications, p.category_id as "categoryId",
           b.slug as "brandSlug", b.name as "brandName",
           p.rating_avg::float8 as "ratingAvg", p.rating_count as "ratingCount", p.updated_at as "updatedAt",
           p.seo_title as "seoTitle", p.seo_description as "seoDescription",
           p.box_contents as "boxContents", p.warranty, p.country_of_origin as "countryOfOrigin",
           p.manufacturer_info as "manufacturerInfo", p.care_instructions as "careInstructions", p.brand_story as "brandStory"
    from shop.products p
    left join shop.brands b on b.id = p.brand_id
    where p.slug = ${slug} and shop.product_live(p.is_active, p.publish_at, p.archived_at)`;
  if (!p) return null;

  const [media, variants, breakdownRows, categories] = await Promise.all([
    sql<Media[]>`
      select id, kind, url, poster_url as "posterUrl", alt, width, height
      from shop.product_media where product_id = ${p.id} order by sort_order, created_at`,
    sql<Variant[]>`
      select v.id, v.sku, v.options, vp.price_paise as "pricePaise", vp.base_price_paise as "basePricePaise", v.mrp_paise as "mrpPaise", v.stock,
             v.media_id as "mediaId", vp.promotion_badge as "promotionBadge", vp.promotion_ends_at as "promotionEndsAt"
      from shop.product_variants v join shop.variant_prices vp on vp.variant_id = v.id
      where v.product_id = ${p.id} and v.is_active order by v.position, vp.price_paise`,
    sql<{ rating: 1 | 2 | 3 | 4 | 5; n: number }[]>`
      select rating, count(*)::int as n from shop.reviews
      where product_id = ${p.id} and status = 'published' group by rating`,
    getCategories(),
  ]);
  if (!variants.length) return null;

  const category = categories.find((c) => c.id === p.categoryId);
  if (!category) return null;
  const breadcrumbs: Category[] = [];
  let cursor: Category | undefined = category;
  while (cursor) {
    breadcrumbs.unshift(cursor);
    const parentId: string | null = cursor.parentId;
    cursor = parentId ? categories.find((c) => c.id === parentId) : undefined;
  }

  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ProductDetail["ratingBreakdown"];
  for (const r of breakdownRows) ratingBreakdown[r.rating] = r.n;

  const optionNames = [...new Set(variants.flatMap((v) => Object.keys(v.options)))];

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    description: p.description,
    highlights: p.highlights,
    specifications: p.specifications,
    brand: p.brandSlug && p.brandName ? { slug: p.brandSlug, name: p.brandName } : null,
    category,
    breadcrumbs,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    ratingBreakdown,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    media,
    variants,
    optionNames,
    updatedAt: p.updatedAt.toISOString(),
    boxContents: p.boxContents,
    warranty: p.warranty,
    countryOfOrigin: p.countryOfOrigin,
    manufacturerInfo: p.manufacturerInfo,
    careInstructions: p.careInstructions,
    brandStory: p.brandStory,
  };
});

/** Alternatives from the same category, then complementary picks from sibling categories. */
export async function getRelatedProducts(product: ProductDetail): Promise<{ similar: ProductSummary[]; complementary: ProductSummary[] }> {
  const sql = db();
  const cols = sql.unsafe(SUMMARY_COLUMNS);
  const parentId = product.category.parentId;
  const [similar, complementary] = await Promise.all([
    sql<ProductSummary[]>`
      select ${cols} from shop.product_listing pl
      where pl.id <> ${product.id}
        and (pl.category_id = ${product.category.id} or (${product.brand?.slug ?? null}::text is not null and pl.brand_slug = ${product.brand?.slug ?? null}))
      order by (pl.category_id = ${product.category.id}) desc, pl.total_stock > 0 desc, pl.units_sold desc
      limit 8`,
    parentId
      ? sql<ProductSummary[]>`
          select ${cols} from shop.product_listing pl
          join shop.categories c on c.id = pl.category_id
          where pl.id <> ${product.id} and c.parent_id = ${parentId} and c.id <> ${product.category.id} and pl.total_stock > 0
          order by pl.units_sold desc, pl.rating_avg desc
          limit 8`
      : Promise.resolve([] as ProductSummary[]),
  ]);
  const seen = new Set(similar.map((p) => p.id));
  return { similar, complementary: complementary.filter((p) => !seen.has(p.id)) };
}

export interface PublishedReview {
  id: string;
  displayName: string;
  rating: number;
  title: string | null;
  body: string | null;
  helpfulCount: number;
  createdAt: Date;
  variantLabel: string | null;
  sellerReply: string | null;
  sellerRepliedAt: Date | null;
  photos: { url: string; width: number | null; height: number | null }[];
}

export const REVIEW_SORTS = { helpful: "Most helpful", newest: "Newest first", highest: "Highest rating", lowest: "Lowest rating" } as const;
export type ReviewSort = keyof typeof REVIEW_SORTS;
export interface ReviewFilters { rating: number | null; withPhotos: boolean; sort: ReviewSort; page: number }
export const REVIEWS_PAGE_SIZE = 10;

/** Reads ?rating=&photos=1&sort=&page= safely. */
export function parseReviewFilters(sp: Record<string, string | string[] | undefined>): ReviewFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const rating = Number(one("rating"));
  const sort = one("sort");
  const page = Math.floor(Number(one("page")));
  return {
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    withPhotos: one("photos") === "1",
    sort: sort in REVIEW_SORTS ? (sort as ReviewSort) : "helpful",
    page: Number.isFinite(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

/** Genuine, published reviews only. Every review comes from a delivered order. */
export async function listReviews(productId: string, f: ReviewFilters, pageSize = REVIEWS_PAGE_SIZE): Promise<{ reviews: PublishedReview[]; total: number }> {
  const sql = db();
  const order = {
    helpful: sql`(exists (select 1 from shop.review_media m where m.review_id = r.id)) desc, r.helpful_count desc, r.created_at desc`,
    newest: sql`r.created_at desc`,
    highest: sql`r.rating desc, r.helpful_count desc, r.created_at desc`,
    lowest: sql`r.rating asc, r.helpful_count desc, r.created_at desc`,
  }[f.sort];
  const where = sql`r.product_id = ${productId} and r.status = 'published'
    ${f.rating ? sql`and r.rating = ${f.rating}` : sql``}
    ${f.withPhotos ? sql`and exists (select 1 from shop.review_media m where m.review_id = r.id)` : sql``}`;
  const [reviews, [count]] = await Promise.all([
    sql<PublishedReview[]>`
      select r.id, r.display_name as "displayName", r.rating, r.title, r.body,
             r.helpful_count as "helpfulCount", r.created_at as "createdAt", i.variant_label as "variantLabel",
             r.seller_reply as "sellerReply", r.seller_replied_at as "sellerRepliedAt",
             coalesce((select json_agg(json_build_object('url', m.url, 'width', m.width, 'height', m.height) order by m.sort_order)
                       from shop.review_media m where m.review_id = r.id), '[]') as photos
      from shop.reviews r left join shop.order_items i on i.id = r.order_item_id
      where ${where}
      order by ${order}
      limit ${pageSize} offset ${(f.page - 1) * pageSize}`,
    sql<{ n: number }[]>`select count(*)::int as n from shop.reviews r where ${where}`,
  ]);
  return { reviews, total: count?.n ?? 0 };
}

export async function getPublishedReviews(productId: string, limit = 10): Promise<PublishedReview[]> {
  return (await listReviews(productId, { rating: null, withPhotos: false, sort: "helpful", page: 1 }, limit)).reviews;
}

/** Customer photos across all published reviews, newest first. */
export async function getReviewPhotos(productId: string, limit = 12): Promise<{ photos: { url: string; reviewId: string }[]; total: number }> {
  const sql = db();
  const [photos, [c]] = await Promise.all([
    sql<{ url: string; reviewId: string }[]>`
      select m.url, m.review_id as "reviewId" from shop.review_media m join shop.reviews r on r.id = m.review_id
      where r.product_id = ${productId} and r.status = 'published' order by r.created_at desc, m.sort_order limit ${limit}`,
    sql<{ n: number }[]>`select count(distinct r.id)::int as n from shop.reviews r join shop.review_media m on m.review_id = r.id where r.product_id = ${productId} and r.status = 'published'`,
  ]);
  return { photos, total: c?.n ?? 0 };
}

// ---------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------

export async function getSitemapEntries() {
  const sql = db();
  const [products, categories] = await Promise.all([
    sql<{ slug: string; updatedAt: Date }[]>`
      select slug, updated_at as "updatedAt" from shop.products where shop.product_live(is_active, publish_at, archived_at) order by updated_at desc limit 45000`,
    sql<{ slug: string; updatedAt: Date }[]>`
      select slug, updated_at as "updatedAt" from shop.categories where shop.category_live(is_active, publish_at) and not noindex`,
  ]);
  return { products, categories };
}

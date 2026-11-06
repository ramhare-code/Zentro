import { z } from "zod";

export const SORTS = ["relevance", "popularity", "price_asc", "price_desc", "rating", "newest"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  relevance: "Relevance",
  popularity: "Popularity",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Customer rating",
  newest: "Newest first",
};

export const PAGE_SIZE = 12;
const MAX_QUERY_LENGTH = 100;

export interface ListingFilters {
  q?: string;
  category?: string;
  brands: string[];
  minPrice?: number; // rupees
  maxPrice?: number; // rupees
  minRating?: number;
  inStock: boolean;
  sort: Sort;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const rupees = z.coerce.number().int().min(0).max(10_000_000);

/** Turns untrusted URL search params into validated filters. Invalid values are dropped, never passed on. */
export function parseListingParams(raw: RawParams, opts: { category?: string } = {}): ListingFilters {
  const q = first(raw.q)?.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH) || undefined;

  const brands = [...new Set(all(raw.brand).flatMap((b) => b.split(",")))]
    .filter((b) => slug.safeParse(b).success)
    .slice(0, 20);

  let minPrice = rupees.safeParse(first(raw.min)).data;
  let maxPrice = rupees.safeParse(first(raw.max)).data;
  if (first(raw.min) === undefined || first(raw.min) === "") minPrice = undefined;
  if (first(raw.max) === undefined || first(raw.max) === "") maxPrice = undefined;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  const rating = z.coerce.number().int().min(1).max(4).safeParse(first(raw.rating)).data;
  const pageParsed = z.coerce.number().int().min(1).max(500).safeParse(first(raw.page)).data;

  const sortRaw = first(raw.sort);
  const defaultSort: Sort = q ? "relevance" : "popularity";
  let sort: Sort = (SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as Sort) : defaultSort;
  if (sort === "relevance" && !q) sort = "popularity";

  const categoryParam = first(raw.category);
  const category = opts.category ?? (categoryParam && slug.safeParse(categoryParam).success ? categoryParam : undefined);

  return {
    q,
    category,
    brands,
    minPrice,
    maxPrice,
    minRating: rating,
    inStock: first(raw.instock) === "1",
    sort,
    page: pageParsed ?? 1,
  };
}

/** Builds a query string from filters, omitting defaults, for links and canonical URLs. */
export function listingQueryString(f: Partial<ListingFilters>, overrides: Partial<ListingFilters> = {}): string {
  const m = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  if (m.brands?.length) p.set("brand", m.brands.join(","));
  if (m.minPrice !== undefined) p.set("min", String(m.minPrice));
  if (m.maxPrice !== undefined) p.set("max", String(m.maxPrice));
  if (m.minRating) p.set("rating", String(m.minRating));
  if (m.inStock) p.set("instock", "1");
  const defaultSort = m.q ? "relevance" : "popularity";
  if (m.sort && m.sort !== defaultSort) p.set("sort", m.sort);
  if (m.page && m.page > 1) p.set("page", String(m.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Splits a free-text query into safe alphanumeric tokens for tsquery building. */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

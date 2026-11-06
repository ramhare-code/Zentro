import Link from "next/link";
import type { ListingResult } from "@/lib/catalog";
import { listingQueryString, type ListingFilters } from "@/lib/listing-params";
import { ProductCard } from "../catalog/ProductCard";
import { FiltersPanel } from "./FiltersPanel";
import { Pagination } from "./Pagination";

export function ListingView({
  basePath,
  filters,
  result,
  popularCategories,
}: {
  basePath: string;
  filters: ListingFilters;
  result: ListingResult;
  popularCategories: { slug: string; name: string }[];
}) {
  const hasFilters = filters.brands.length > 0 || filters.minPrice !== undefined || filters.maxPrice !== undefined || !!filters.minRating || filters.inStock;
  return (
    <FiltersPanel
      filters={filters}
      brands={result.facets.brands}
      priceMin={result.facets.priceMinPaise !== null ? Math.floor(result.facets.priceMinPaise / 100) : null}
      priceMax={result.facets.priceMaxPaise !== null ? Math.ceil(result.facets.priceMaxPaise / 100) : null}
      total={result.total}
    >
      {result.products.length > 0 ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
            {result.products.map((p, i) => (
              <li key={p.id}><ProductCard product={p} priority={i < 4} className="h-full" /></li>
            ))}
          </ul>
          <Pagination basePath={basePath} filters={filters} page={result.page} pageCount={result.pageCount} />
        </>
      ) : (
        <div className="rounded-card bg-white p-8 text-center ring-1 ring-line sm:p-12">
          <h2 className="font-display text-xl font-bold">No products match{filters.q ? ` “${filters.q}”` : ""}</h2>
          {result.correctedQuery && (
            <p className="mt-3">
              Did you mean{" "}
              <Link href={`/search?q=${encodeURIComponent(result.correctedQuery)}`} className="font-semibold text-brand-700 underline">
                {result.correctedQuery}
              </Link>
              ?
            </p>
          )}
          <ul className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm text-ink-muted">
            <li>• Check the spelling or try a more general word</li>
            {hasFilters && (
              <li>
                •{" "}
                <Link href={`${basePath}${listingQueryString({ q: filters.q, sort: filters.sort })}`} className="font-semibold text-brand-700 hover:underline">
                  Clear all filters
                </Link>
              </li>
            )}
            <li>• Browse a category instead:</li>
          </ul>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {popularCategories.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="inline-flex h-9 items-center rounded-full bg-brand-50 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FiltersPanel>
  );
}

import type { Metadata } from "next";
import { ListingView } from "@/components/listing/ListingView";
import { getCategories, listProducts } from "@/lib/catalog";
import { parseListingParams } from "@/lib/listing-params";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseListingParams(await searchParams);
  return {
    title: q ? `Results for “${q}”` : "All products",
    alternates: { canonical: "/search" },
    // search result pages are not indexed (thin/duplicate content)
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseListingParams(await searchParams);
  const [result, categories] = await Promise.all([listProducts(filters), getCategories()]);
  return (
    <div className="container-page py-6 sm:py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        {filters.q ? <>Results for “{filters.q}”</> : "All products"}
      </h1>
      <div className="mt-6">
        <ListingView basePath="/search" filters={filters} result={result} popularCategories={categories.filter((c) => !c.parentId)} />
      </div>
    </div>
  );
}

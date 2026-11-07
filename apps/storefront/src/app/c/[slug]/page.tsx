import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { ListingView } from "@/components/listing/ListingView";
import { getCategories, getCategoryBanners, getCategoryBySlug, listProducts } from "@/lib/catalog";
import { CategoryBanner } from "@/components/home/CategoryBanner";
import { listingQueryString, parseListingParams } from "@/lib/listing-params";
import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await getCategoryBySlug(slug);
  if (!found) return { title: "Category not found" };
  const f = parseListingParams(await searchParams, { category: slug });
  const filtered = f.brands.length || f.minPrice !== undefined || f.maxPrice !== undefined || f.minRating || f.inStock || f.sort !== "popularity";
  return {
    title: found.category.seoTitle ?? found.category.name,
    description: found.category.seoDescription ?? found.category.description ?? `Shop ${found.category.name} online.`,
    // filtered/sorted variants point search engines at the clean page (page number kept)
    alternates: { canonical: `/c/${slug}${f.page > 1 ? `?page=${f.page}` : ""}` },
    robots: filtered || found.category.noindex ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const found = await getCategoryBySlug(slug);
  if (!found) notFound();
  const filters = parseListingParams(await searchParams, { category: slug });
  const [result, all, banners] = await Promise.all([listProducts(filters), getCategories(), getCategoryBanners(found.category.id)]);
  const { category, trail, children } = found;

  return (
    <div className="container-page py-6 sm:py-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [{ name: "Home", path: "/" }, ...trail.map((c) => ({ name: c.name, path: `/c/${c.slug}` }))].map((c, i) => ({
            "@type": "ListItem", position: i + 1, name: c.name, item: siteUrl(c.path),
          })),
        }}
      />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, ...trail.map((c, i) => ({ name: c.name, href: i < trail.length - 1 ? `/c/${c.slug}` : undefined }))]} />
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{category.name}</h1>
      {category.description && <p className="mt-1 text-ink-muted">{category.description}</p>}
      {banners[0] && <CategoryBanner banner={banners[0]} />}
      {children.length > 0 && (
        <ul className="mt-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="Subcategories">
          {children.map((c) => (
            <li key={c.id} className="shrink-0">
              <Link href={`/c/${c.slug}${listingQueryString({ ...filters, page: 1 })}`} className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-line hover:bg-brand-50 hover:ring-brand-200">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <ListingView basePath={`/c/${slug}`} filters={filters} result={result} popularCategories={all.filter((c) => !c.parentId && c.slug !== slug)} />
      </div>
    </div>
  );
}

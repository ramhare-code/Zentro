import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { ProductRail } from "@/components/catalog/ProductRail";
import { RatingBadge } from "@/components/catalog/RatingBadge";
import { JsonLd } from "@/components/JsonLd";
import { TrackProductView } from "@/components/analytics/Analytics";
import { WishlistButton } from "@/components/engage/WishlistButton";
import { ProductInteractive } from "@/components/product/ProductInteractive";
import { ReviewsSection } from "@/components/product/ReviewsSection";
import { getProductBySlug, getPublishedReviews, getRelatedProducts } from "@/lib/catalog";
import { SITE_NAME, siteUrl } from "@/lib/site";

export const revalidate = 300;
// Pages are generated on first request, then cached.
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const image = product.media.find((m) => m.kind === "image");
  return {
    title: product.name,
    description: product.shortDescription ?? undefined,
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: { type: "website", title: product.name, description: product.shortDescription ?? undefined, images: image ? [{ url: image.url, alt: image.alt }] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [reviews, related] = await Promise.all([getPublishedReviews(product.id), getRelatedProducts(product)]);

  const prices = product.variants.map((v) => v.pricePaise);
  const inStock = product.variants.some((v) => v.stock > 0);
  const images = product.media.filter((m) => m.kind === "image").map((m) => m.url);

  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    image: images,
    sku: product.variants[0]?.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    category: product.category.name,
    url: siteUrl(`/p/${product.slug}`),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: SITE_NAME },
    },
  };
  // Only genuine, published reviews feed structured data.
  if (product.ratingCount > 0) {
    productLd.aggregateRating = { "@type": "AggregateRating", ratingValue: product.ratingAvg.toFixed(1), reviewCount: product.ratingCount };
  }

  const crumbs = [{ name: "Home", path: "/" }, ...product.breadcrumbs.map((c) => ({ name: c.name, path: `/c/${c.slug}` })), { name: product.name, path: `/p/${product.slug}` }];

  return (
    <div className="container-page py-6 sm:py-8">
      <TrackProductView productId={product.id} />
      <JsonLd data={productLd} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: siteUrl(c.path) })),
        }}
      />
      <Breadcrumbs items={crumbs.map((c, i) => ({ name: c.name, href: i < crumbs.length - 1 ? c.path : undefined }))} />

      <div className="mt-5">
        <ProductInteractive
          productId={product.id}
          productName={product.name}
          media={product.media}
          variants={product.variants}
          optionNames={product.optionNames}
          header={
            <>
              {product.brand && (
                <Link href={`/search?brand=${product.brand.slug}`} className="text-sm font-semibold uppercase tracking-wide text-brand-700 hover:underline">
                  {product.brand.name}
                </Link>
              )}
              <h1 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{product.name}</h1>
              <RatingBadge avg={product.ratingAvg} count={product.ratingCount} className="mt-2" />
              {product.shortDescription && <p className="mt-3 text-ink-muted">{product.shortDescription}</p>}
              <div className="mt-4"><WishlistButton productId={product.id} slug={product.slug} /></div>
            </>
          }
        />
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        {(product.highlights.length > 0 || product.description) && (
          <section aria-labelledby="about" className="rounded-card bg-white p-6 ring-1 ring-line">
            <h2 id="about" className="font-display text-xl font-bold">About this product</h2>
            {product.highlights.length > 0 && (
              <ul className="mt-4 space-y-2">
                {product.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-sm"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" />{h}</li>
                ))}
              </ul>
            )}
            {product.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{product.description}</p>}
          </section>
        )}
        {product.specifications.length > 0 && (
          <section aria-labelledby="specs" className="rounded-card bg-white p-6 ring-1 ring-line">
            <h2 id="specs" className="font-display text-xl font-bold">Specifications</h2>
            {product.specifications.map((g) => (
              <div key={g.group} className="mt-4">
                <h3 className="text-sm font-semibold text-ink-muted">{g.group}</h3>
                <dl className="mt-2 divide-y divide-line text-sm">
                  {g.items.map((it) => (
                    <div key={it.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2.5">
                      <dt className="text-ink-muted">{it.label}</dt>
                      <dd className="font-medium">{it.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>
        )}
      </div>

      <ReviewsSection product={product} reviews={reviews} />

      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <ProductRail id="similar" title="Similar products" products={related.similar} href={`/c/${product.category.slug}`} />
        <ProductRail id="complementary" title="You may also like" products={related.complementary} />
      </div>
    </div>
  );
}

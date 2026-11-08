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
import { AboutSection, BrandStory, SectionNav, SpecsAndInfo } from "@/components/product/ProductDetails";
import { getProductBySlug, getPublishedReviews, getRelatedProducts, getReviewPhotos } from "@/lib/catalog";
import { SITE_NAME, siteUrl } from "@/lib/site";

// Rendered on first request, then cached for 5 minutes. No generateStaticParams:
// declaring the route as statically generated breaks it when the root layout
// opts into request-time rendering (SKIP_BUILD_PRERENDER=1).
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const image = product.media.find((m) => m.kind === "image");
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: { type: "website", title: product.name, description: product.shortDescription ?? undefined, images: image ? [{ url: image.url, alt: image.alt }] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [reviews, related, reviewPhotos] = await Promise.all([getPublishedReviews(product.id, 5), getRelatedProducts(product), getReviewPhotos(product.id)]);

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
    productLd.review = reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.displayName },
      datePublished: new Date(r.createdAt).toISOString().slice(0, 10),
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      name: r.title ?? undefined,
      reviewBody: r.body ?? undefined,
    }));
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
              {product.ratingCount > 0 && <a href="#reviews" className="mt-2 inline-block rounded-md hover:opacity-80" aria-label={`Rated ${product.ratingAvg.toFixed(1)} out of 5 from ${product.ratingCount} ratings. Go to reviews`}><RatingBadge avg={product.ratingAvg} count={product.ratingCount} /></a>}
              {product.shortDescription && <p className="mt-3 text-ink-muted">{product.shortDescription}</p>}
              <div className="mt-4"><WishlistButton productId={product.id} slug={product.slug} /></div>
            </>
          }
        />
      </div>

      <SectionNav
        items={[
          ...(product.highlights.length || product.description ? [{ id: "description", label: "Description" }] : []),
          ...(product.brandStory.length ? [{ id: "from-the-brand", label: "From the brand" }] : []),
          ...(product.specifications.length || product.boxContents.length || product.warranty || product.manufacturerInfo ? [{ id: "specifications", label: "Specifications" }] : []),
          { id: "reviews", label: product.ratingCount ? `Reviews (${product.ratingCount.toLocaleString("en-IN")})` : "Reviews" },
        ]}
      />
      <div className="mt-6 space-y-10">
        <AboutSection product={product} />
        <BrandStory product={product} />
        <SpecsAndInfo product={product} />
        <ReviewsSection product={product} reviews={reviews} photos={reviewPhotos} />
      </div>

      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <ProductRail id="similar" title="Similar products" products={related.similar} href={`/c/${product.category.slug}`} />
        <ProductRail id="complementary" title="You may also like" products={related.complementary} />
      </div>
    </div>
  );
}

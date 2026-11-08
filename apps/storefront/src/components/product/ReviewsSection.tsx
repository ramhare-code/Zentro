import Link from "next/link";
import type { ProductDetail, PublishedReview } from "@/lib/catalog";
import { ReviewCard } from "../reviews/ReviewCard";
import { CustomerPhotos, RatingSummary } from "../reviews/RatingSummary";

export function ReviewsSection({ product, reviews, photos }: { product: ProductDetail; reviews: PublishedReview[]; photos: { photos: { url: string; reviewId: string }[]; total: number } }) {
  const total = product.ratingCount;
  const allHref = `/p/${product.slug}/reviews`;
  return (
    <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-36">
      <h2 id="reviews-h" className="font-display text-xl font-bold sm:text-2xl">Ratings & reviews</h2>
      {total === 0 ? (
        <div className="mt-4 rounded-card bg-white p-6 ring-1 ring-line">
          <p className="font-semibold">No reviews yet</p>
          <p className="mt-1 text-sm text-ink-muted">Only customers who bought and received this product can review it, so every rating here is genuine. Bought it? Review it from <Link href="/account/orders" className="font-semibold text-brand-700 underline">your orders</Link> after delivery.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[20rem_1fr]">
          <div className="lg:sticky lg:top-40 lg:self-start"><RatingSummary product={product} baseHref={allHref} /></div>
          <div className="rounded-card bg-white p-6 ring-1 ring-line">
            <CustomerPhotos photos={photos.photos} total={photos.total} href={allHref} />
            <h3 className={photos.photos.length ? "mt-6 font-semibold" : "font-semibold"}>Top reviews</h3>
            <div className="mt-4">
              {reviews.map((r) => <ReviewCard key={r.id} r={r} returnTo={`/p/${product.slug}#review-${r.id}`} />)}
            </div>
            {total > reviews.length && (
              <Link href={allHref} className="mt-2 inline-flex h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white hover:bg-ink/90">
                See all {total.toLocaleString("en-IN")} reviews
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

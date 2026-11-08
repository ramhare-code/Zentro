import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { CustomerPhotos, RatingSummary } from "@/components/reviews/RatingSummary";
import { getProductBySlug, getReviewPhotos, listReviews, parseReviewFilters, REVIEW_SORTS, REVIEWS_PAGE_SIZE, type ReviewFilters } from "@/lib/catalog";
import { formatPaise } from "@zentro/commerce";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  return { title: `Reviews: ${product.name}`, alternates: { canonical: `/p/${product.slug}/reviews` }, robots: { index: product.ratingCount > 0, follow: true } };
}

function href(base: string, f: Partial<ReviewFilters>) {
  const q = new URLSearchParams();
  if (f.rating) q.set("rating", String(f.rating));
  if (f.withPhotos) q.set("photos", "1");
  if (f.sort && f.sort !== "helpful") q.set("sort", f.sort);
  if (f.page && f.page > 1) q.set("page", String(f.page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export default async function ReviewsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const f = parseReviewFilters(await searchParams);
  const base = `/p/${product.slug}/reviews`;
  const [{ reviews, total }, photos] = await Promise.all([listReviews(product.id, f), getReviewPhotos(product.id, 16)]);
  const pages = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));
  const thumb = product.media.find((m) => m.kind === "image");
  const price = Math.min(...product.variants.map((v) => v.pricePaise));
  const chips: { label: string; to: Partial<ReviewFilters>; active: boolean }[] = [
    { label: "All", to: { sort: f.sort }, active: !f.rating && !f.withPhotos },
    ...([5, 4, 3, 2, 1] as const).map((n) => ({ label: `${n} ★ (${product.ratingBreakdown[n]})`, to: { rating: n, withPhotos: f.withPhotos, sort: f.sort }, active: f.rating === n })),
    { label: `With photos (${photos.total})`, to: { rating: f.rating, withPhotos: !f.withPhotos, sort: f.sort }, active: f.withPhotos },
  ];

  return (
    <div className="container-page py-6 sm:py-8">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: product.name, href: `/p/${product.slug}` }, { name: "Reviews" }]} />
      <div className="mt-5 flex items-center gap-4">
        {thumb && <Image src={thumb.url} alt="" width={72} height={72} className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-line sm:size-[72px]" />}
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl">Ratings & reviews</h1>
          <p className="mt-0.5 truncate text-sm text-ink-muted"><Link href={`/p/${product.slug}`} className="font-semibold text-brand-700 hover:underline">{product.name}</Link> · {formatPaise(price)}</p>
        </div>
      </div>

      {product.ratingCount === 0 ? (
        <div className="mt-6 rounded-card bg-white p-6 ring-1 ring-line">
          <p className="font-semibold">No reviews yet</p>
          <p className="mt-1 text-sm text-ink-muted">Only customers who bought and received this product can review it.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
          <div className="lg:sticky lg:top-40 lg:self-start"><RatingSummary product={product} baseHref={base} /></div>
          <div className="min-w-0 rounded-card bg-white p-6 ring-1 ring-line">
            <CustomerPhotos photos={photos.photos} total={photos.total} href={base} />
            <div className={clsx("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", photos.photos.length && "mt-6")}>
              <nav aria-label="Filter reviews">
                <ul className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <li key={c.label}>
                      <Link href={href(base, c.to)} aria-current={c.active ? "true" : undefined} className={clsx("inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold ring-1", c.active ? "bg-ink text-white ring-ink" : "text-ink ring-line-strong hover:bg-canvas")}>{c.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <form action={base} method="get" className="flex items-center gap-2">
                {f.rating && <input type="hidden" name="rating" value={f.rating} />}
                {f.withPhotos && <input type="hidden" name="photos" value="1" />}
                <label htmlFor="review-sort" className="shrink-0 text-sm text-ink-muted">Sort by</label>
                <select id="review-sort" name="sort" defaultValue={f.sort} className="h-9 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-line-strong">
                  {Object.entries(REVIEW_SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button type="submit" className="h-9 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Apply</button>
              </form>
            </div>
            <p className="mt-4 text-sm text-ink-muted" aria-live="polite">
              {total === 0 ? "No reviews match these filters." : `Showing ${(f.page - 1) * REVIEWS_PAGE_SIZE + 1}–${Math.min(f.page * REVIEWS_PAGE_SIZE, total)} of ${total.toLocaleString("en-IN")} ${total === 1 ? "review" : "reviews"}`}
            </p>
            <div className="mt-4">
              {reviews.map((r) => <ReviewCard key={r.id} r={r} returnTo={`${href(base, f)}#review-${r.id}`} />)}
            </div>
            {pages > 1 && (
              <nav aria-label="Review pages" className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                {f.page > 1 ? <Link href={href(base, { ...f, page: f.page - 1 })} className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold ring-1 ring-line-strong hover:bg-canvas">← Previous</Link> : <span />}
                <span className="text-sm text-ink-muted">Page {f.page} of {pages}</span>
                {f.page < pages ? <Link href={href(base, { ...f, page: f.page + 1 })} className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold ring-1 ring-line-strong hover:bg-canvas">Next →</Link> : <span />}
              </nav>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

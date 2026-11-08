import Image from "next/image";
import Link from "next/link";
import type { ProductDetail } from "@/lib/catalog";
import { Stars } from "./Stars";

/** Average, star bars (each links to that filter) and how to write a review. */
export function RatingSummary({ product, baseHref }: { product: ProductDetail; baseHref: string }) {
  const total = product.ratingCount;
  return (
    <div className="rounded-card bg-white p-6 ring-1 ring-line">
      <div className="flex items-center gap-3">
        <span className="font-display text-5xl font-bold">{product.ratingAvg.toFixed(1)}</span>
        <div>
          <Stars rating={product.ratingAvg} size={20} />
          <p className="mt-1 text-sm text-ink-muted">{total.toLocaleString("en-IN")} verified {total === 1 ? "rating" : "ratings"}</p>
        </div>
      </div>
      <ul className="mt-5 space-y-1.5" aria-label="Rating breakdown">
        {([5, 4, 3, 2, 1] as const).map((n) => {
          const c = product.ratingBreakdown[n];
          const pct = total ? Math.round((c / total) * 100) : 0;
          const row = (
            <>
              <span className="w-12 shrink-0 text-sm">{n} star</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-canvas ring-1 ring-line" aria-hidden>
                <span className="block h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-10 shrink-0 text-right text-sm text-ink-muted">{pct}%</span>
            </>
          );
          return (
            <li key={n}>
              {c > 0 ? (
                <Link href={`${baseHref}?rating=${n}`} aria-label={`${n} star: ${pct}% (${c}). Show these reviews`} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-brand-50">{row}</Link>
              ) : <div className="flex items-center gap-2 px-1 py-0.5 text-ink-muted" aria-label={`${n} star: none`}>{row}</div>}
            </li>
          );
        })}
      </ul>
      <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-semibold">Review this product</h3>
        <p className="mt-1 text-sm text-ink-muted">Only customers who bought and received it can review, so every rating here is genuine. Find it in your orders after delivery.</p>
        <Link href="/account/orders" className="mt-3 inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">Write a review</Link>
      </div>
    </div>
  );
}

export function CustomerPhotos({ photos, total, href }: { photos: { url: string; reviewId: string }[]; total: number; href: string }) {
  if (!photos.length) return null;
  return (
    <div>
      <h3 className="font-semibold">Customer photos <span className="font-normal text-ink-muted">({total.toLocaleString("en-IN")} {total === 1 ? "review" : "reviews"})</span></h3>
      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {photos.map((p, i) => (
          <li key={i} className="shrink-0">
            <Link href={`${href}?photos=1#review-${p.reviewId}`} aria-label={`Customer photo ${i + 1}. Show reviews with photos`} className="block overflow-hidden rounded-xl ring-1 ring-line hover:ring-brand-400">
              <Image src={p.url} alt="" width={96} height={96} className="size-20 object-cover sm:size-24" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

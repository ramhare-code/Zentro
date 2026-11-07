import Image from "next/image";
import type { ProductDetail, PublishedReview } from "@/lib/catalog";
import { StarIcon } from "../icons";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function ReviewsSection({ product, reviews }: { product: ProductDetail; reviews: PublishedReview[] }) {
  const total = product.ratingCount;
  return (
    <section aria-labelledby="reviews" className="mt-12">
      <h2 id="reviews" className="font-display text-2xl font-bold tracking-tight">Ratings & reviews</h2>
      {total === 0 ? (
        <div className="mt-4 rounded-card bg-white p-6 ring-1 ring-line">
          <p className="font-semibold">No reviews yet</p>
          <p className="mt-1 text-sm text-ink-muted">Only customers who bought and received this product can review it, so every rating here is genuine.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div className="rounded-card bg-white p-6 ring-1 ring-line">
            <p className="flex items-center gap-2 text-4xl font-bold">
              {product.ratingAvg.toFixed(1)} <StarIcon size={28} className="text-accent-500" />
            </p>
            <p className="mt-1 text-sm text-ink-muted">Based on {total.toLocaleString("en-IN")} verified {total === 1 ? "rating" : "ratings"}</p>
            <ul className="mt-5 space-y-2">
              {([5, 4, 3, 2, 1] as const).map((r) => {
                const n = product.ratingBreakdown[r];
                const pct = total ? Math.round((n / total) * 100) : 0;
                return (
                  <li key={r} className="flex items-center gap-2 text-sm">
                    <span className="w-6 shrink-0">{r}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas" role="img" aria-label={`${pct}% gave ${r} stars`}>
                      <span className="block h-full rounded-full bg-success-700" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-10 shrink-0 text-right text-ink-muted">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-card bg-white p-5 ring-1 ring-line">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-success-700 px-1.5 py-0.5 text-xs font-bold text-white">{r.rating}<StarIcon size={11} /></span>
                  {r.title && <h3 className="font-semibold">{r.title}</h3>}
                </div>
                {r.body && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{r.body}</p>}
                {r.photos.length > 0 && (
                  <ul aria-label={`Photos from ${r.displayName}`} className="mt-3 flex gap-2">
                    {r.photos.map((p, i) => (
                      <li key={i}><a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-line">
                        <Image src={p.url} alt={`Customer photo ${i + 1} of ${r.photos.length} from ${r.displayName}`} width={96} height={96} className="size-24 object-cover" />
                      </a></li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-ink-subtle">
                  {r.displayName} · Verified buyer · {dateFmt.format(r.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

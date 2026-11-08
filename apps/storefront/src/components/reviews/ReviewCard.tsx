import Image from "next/image";
import type { PublishedReview } from "@/lib/catalog";
import { SITE_NAME } from "@/lib/site";
import { CheckBadgeIcon } from "../icons";
import { ExpandableText } from "./ExpandableText";
import { ReviewFeedback } from "./ReviewFeedback";
import { Stars } from "./Stars";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export function ReviewCard({ r, returnTo }: { r: PublishedReview; returnTo: string }) {
  return (
    <article id={`review-${r.id}`} aria-labelledby={`review-${r.id}-h`} className="scroll-mt-36 border-b border-line py-6 first:pt-0 last:border-0">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800">{r.displayName.trim().charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.displayName}</p>
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-success-700"><CheckBadgeIcon size={14} />Verified purchase</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={r.rating} size={16} />
        <h3 id={`review-${r.id}-h`} className="font-semibold">{r.title || `${r.rating} star review`}</h3>
      </div>
      <p className="mt-1 text-xs text-ink-subtle">
        Reviewed on {dateFmt.format(new Date(r.createdAt))}
        {r.variantLabel && <> · <span className="text-ink-muted">{r.variantLabel}</span></>}
      </p>
      {r.body && <ExpandableText text={r.body} />}
      {r.photos.length > 0 && (
        <ul aria-label={`Photos from ${r.displayName}`} className="mt-3 flex flex-wrap gap-2">
          {r.photos.map((p, i) => (
            <li key={i}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-line transition hover:ring-brand-400">
                <Image src={p.url} alt={`Customer photo ${i + 1} of ${r.photos.length} from ${r.displayName}`} width={112} height={112} className="size-24 object-cover sm:size-28" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {r.sellerReply && (
        <div className="mt-4 rounded-xl border-l-4 border-brand-500 bg-brand-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-800">Response from {SITE_NAME}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{r.sellerReply}</p>
          {r.sellerRepliedAt && <p className="mt-1 text-xs text-ink-subtle">{dateFmt.format(new Date(r.sellerRepliedAt))}</p>}
        </div>
      )}
      <ReviewFeedback reviewId={r.id} helpfulCount={r.helpfulCount} returnTo={returnTo} />
    </article>
  );
}

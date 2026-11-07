import Link from "next/link";
import clsx from "clsx";
import { z } from "zod";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { moderateReviewAction, removeReviewPhotoAction } from "@/lib/actions/reviews";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("reviews.moderate");
  const status = z.enum(["pending", "published", "rejected"]).safeParse((await searchParams).status).data ?? "pending";
  const sql = db();
  const [rows, counts] = await Promise.all([
    sql<{ id: string; product: string; slug: string; rating: number; title: string | null; body: string | null; displayName: string; flags: string[]; reason: string | null; orderNumber: string; orderId: string; createdAt: Date; photos: { id: string }[] }[]>`
      select r.id, p.name as product, p.slug, r.rating, r.title, r.body, r.display_name as "displayName", r.auto_flags as flags,
             r.moderation_reason as reason, o.order_number as "orderNumber", o.id as "orderId", r.created_at as "createdAt",
             coalesce((select json_agg(json_build_object('id', m.id) order by m.sort_order) from shop.review_media m where m.review_id = r.id), '[]') as photos
      from shop.reviews r join shop.products p on p.id = r.product_id join shop.order_items i on i.id = r.order_item_id join shop.orders o on o.id = i.order_id
      where r.status = ${status} order by r.created_at ${status === "pending" ? sql`asc` : sql`desc`} limit 100`,
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from shop.reviews group by status`,
  ]);
  const count = (st: string) => counts.find((c) => c.status === st)?.n ?? 0;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-ink-muted">Only delivered buyers can review. Reviews without automatic flags publish immediately; flagged ones wait here. Moderation can publish or reject — never edit wording or stars — so ratings stay genuine.</p>
      </div>
      <nav aria-label="Review status" className="flex gap-2">
        {(["pending", "published", "rejected"] as const).map((st) => (
          <Link key={st} href={`?status=${st}`} aria-current={st === status ? "page" : undefined} className={clsx("rounded-full px-3 py-1.5 text-sm font-semibold capitalize ring-1", st === status ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-line")}>
            {st} <span className="opacity-70">{count(st)}</span>
          </Link>
        ))}
      </nav>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.product} · <span className="text-accent-700">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></p>
                <p className="text-xs text-ink-muted">{r.displayName} · verified buyer · <Link href={`/orders/${r.orderId}`} className="text-brand-700 hover:underline">{r.orderNumber}</Link> · {formatDateTime(r.createdAt)}</p>
              </div>
              {r.flags.length > 0 && <p className="rounded-lg bg-warn-50 px-2 py-1 text-xs font-semibold text-warn-700">Flagged: {r.flags.join(", ")}</p>}
            </div>
            {r.title && <p className="mt-3 font-medium">{r.title}</p>}
            {r.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{r.body}</p>}
            {r.reason && <p className="mt-2 text-xs text-ink-muted">Rejected: {r.reason.replace(/_/g, " ")}</p>}
            {/* stays mounted after the last photo is removed so the confirmation remains */}
            {(
              <ActionForm action={removeReviewPhotoAction} className={r.photos.length ? "mt-3" : ""}>
                {r.photos.length > 0 && <ul aria-label="Review photos" className="flex flex-wrap gap-3">
                  {r.photos.map((p, i) => (
                    <li key={p.id} className="space-y-1">
                      <a href={`/api/review-photo/${p.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/review-photo/${p.id}`} alt={`Photo ${i + 1} from ${r.displayName}`} className="size-28 rounded-lg object-cover ring-1 ring-line" /></a>
                      <SubmitButton name="photoId" value={p.id} variant="secondary" className="h-8 w-28 px-2 text-xs" confirm="Remove this photo? The review stays.">Remove photo</SubmitButton>
                    </li>
                  ))}
                </ul>}
              </ActionForm>
            )}
            <ActionForm action={moderateReviewAction} className="mt-4 flex flex-wrap items-center gap-2">
              <input type="hidden" name="reviewId" value={r.id} />
              {status !== "published" && <SubmitButton name="op" value="publish">Publish</SubmitButton>}
              {status !== "rejected" && (
                <>
                  <select name="reason" aria-label="Rejection reason" className="input h-10 w-56 text-sm" defaultValue="">
                    <option value="">Reason to reject…</option>
                    <option value="spam">Spam / advertising</option><option value="abusive">Abusive or hateful</option>
                    <option value="personal_information">Contains personal information</option><option value="not_about_product">Not about the product</option>
                    <option value="duplicate">Duplicate</option><option value="other">Other policy breach</option>
                  </select>
                  <SubmitButton name="op" value="reject" variant="danger">Reject</SubmitButton>
                </>
              )}
            </ActionForm>
          </li>
        ))}
        {rows.length === 0 && <li className="card p-8 text-center text-ink-muted">No {status} reviews.</li>}
      </ul>
    </div>
  );
}

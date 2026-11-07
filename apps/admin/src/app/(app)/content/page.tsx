import Link from "next/link";
import { listPages } from "@/lib/content-admin";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Pages & FAQs" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requirePermission("marketing.manage");
  const [pages, [faq]] = await Promise.all([listPages(), db()<{ n: number; live: number }[]>`select count(*)::int as n, count(*) filter (where is_active)::int as live from shop.faqs`]);
  const review = pages.filter((p) => p.needsReview).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight">Pages & FAQs</h1><Link href="/content/new" className="btn btn-primary">New page</Link></div>
      {(await searchParams).deleted === "1" && <p role="status" className="rounded-xl bg-good-50 px-4 py-3 text-sm text-good-700">Page deleted.</p>}
      {review > 0 && <p className="card border-l-4 border-warn-500 p-4 text-sm"><strong>{review} polic{review === 1 ? "y is" : "ies are"} still the starter text.</strong> Have them checked by a legal adviser against how you actually operate, then publish with “reviewed” ticked.</p>}
      <div className="card divide-y divide-line">
        {pages.map((p) => (
          <Link key={p.id} href={`/content/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-canvas">
            <span><span className="font-semibold">{p.title}</span> <span className="text-xs text-ink-muted">{p.kind === "policy" ? "Policy" : "Page"} · /{p.kind === "policy" ? "policies" : "pages"}/{p.slug}</span>
              <span className="block text-xs text-ink-muted">Edited {formatDateTime(p.updatedAt)}{p.updatedBy && ` by ${p.updatedBy}`}</span></span>
            <span className="flex flex-wrap gap-2 text-xs font-semibold">
              {p.needsReview && <span className="rounded-full bg-warn-50 px-2 py-0.5 text-warn-700">Needs legal review</span>}
              {p.publishedVersion === null ? <span className="rounded-full bg-canvas px-2 py-0.5 text-ink-muted">Not published</span>
                : p.publishedVersion !== p.draftVersion ? <span className="rounded-full bg-info-50 px-2 py-0.5 text-info-700">Unpublished changes</span>
                : <span className="rounded-full bg-good-50 px-2 py-0.5 text-good-700">Live</span>}
            </span>
          </Link>
        ))}
      </div>
      <Link href="/content/faqs" className="card flex items-center justify-between p-4 hover:bg-canvas"><span><span className="font-semibold">Help centre FAQs</span><span className="block text-xs text-ink-muted">{faq!.live} live of {faq!.n}</span></span><span className="text-sm font-semibold text-brand-700">Manage →</span></Link>
    </div>
  );
}

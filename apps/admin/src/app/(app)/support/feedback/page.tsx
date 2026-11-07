import Link from "next/link";
import clsx from "clsx";
import { z } from "zod";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { updateFeedbackAction } from "@/lib/actions/feedback";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { maskEmail } from "@/lib/mask";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Site feedback" };
const KIND: Record<string, string> = { problem: "Problem", suggestion: "Suggestion", praise: "Praise", other: "Other" };

export default async function FeedbackInbox({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const s = await requirePermission("support.manage");
  const sp = await searchParams;
  const status = z.enum(["new", "reviewed", "archived"]).catch("new").parse(sp.status);
  const kind = z.enum(["problem", "suggestion", "praise", "other"]).safeParse(sp.kind).data;
  const sql = db();
  const [rows, [stats]] = await Promise.all([
    sql<{ id: number; kind: string; rating: number | null; message: string; page: string | null; email: string | null; device: string | null; note: string | null; createdAt: Date; customerId: string | null }[]>`
      select id, kind, rating, message, page_path as page, email, device, staff_note as note, created_at as "createdAt", user_id as "customerId"
      from shop.site_feedback where status = ${status} ${kind ? sql`and kind = ${kind}` : sql``} order by created_at desc limit 200`,
    sql<{ fresh: number; avg: number | null; problems: number }[]>`
      select count(*) filter (where status = 'new')::int as fresh, round(avg(rating) filter (where created_at > now() - interval '30 days'), 1)::float8 as avg,
             count(*) filter (where kind = 'problem' and created_at > now() - interval '30 days')::int as problems from shop.site_feedback`,
  ]);
  const pii = s.permissions.has("customers.pii");
  const link = (st: string) => `/support/feedback?status=${st}${kind ? `&kind=${kind}` : ""}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><Link href="/support" className="text-sm font-semibold text-brand-700 hover:underline">← Support</Link><h1 className="mt-1 text-2xl font-bold tracking-tight">Site feedback</h1></div>
        <p className="text-sm text-ink-muted">{stats!.fresh} new · last 30 days: {stats!.avg ?? "—"}★ average, {stats!.problems} problem report(s)</p>
      </div>
      <nav aria-label="Feedback status" className="flex flex-wrap gap-2 text-sm">
        {(["new", "reviewed", "archived"] as const).map((st) => <Link key={st} href={link(st)} aria-current={st === status ? "page" : undefined} className={clsx("rounded-full px-3 py-1 capitalize ring-1", st === status ? "bg-ink text-white ring-ink" : "ring-line")}>{st}</Link>)}
      </nav>
      {/* one form for the list so the result stays visible after an item moves */}
      <ActionForm action={updateFeedbackAction} className="space-y-3">
        {rows.map((r) => (
          <article key={r.id} aria-label={`Feedback ${r.id}`} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p><span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", r.kind === "problem" ? "bg-bad-50 text-bad-700" : r.kind === "praise" ? "bg-good-50 text-good-700" : "bg-info-50 text-info-700")}>{KIND[r.kind]}</span>
                {r.rating && <span className="ml-2 text-accent-700">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>}</p>
              <p className="text-xs text-ink-muted">{formatDateTime(r.createdAt)}{r.device && ` · ${r.device}`}{r.page && <> · on <code>{r.page}</code></>}</p>
            </div>
            <p className="mt-2 whitespace-pre-line">{r.message}</p>
            <p className="mt-2 text-xs text-ink-muted">{r.email ? (pii ? r.email : maskEmail(r.email)) : "No email"}{r.customerId && <> · <Link href={`/customers/${r.customerId}`} className="text-brand-700 underline">customer</Link></>}{r.note && ` · Note: ${r.note}`}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {status !== "reviewed" && <SubmitButton name="op" value={`reviewed:${r.id}`} variant="secondary" className="h-8 px-3">Mark reviewed</SubmitButton>}
              {status !== "archived" && <SubmitButton name="op" value={`archived:${r.id}`} variant="secondary" className="h-8 px-3">Archive</SubmitButton>}
              {status !== "new" && <SubmitButton name="op" value={`new:${r.id}`} variant="secondary" className="h-8 px-3">Move to new</SubmitButton>}
            </div>
          </article>
        ))}
        {rows.length === 0 && <p className="card p-8 text-center text-ink-muted">No {status} feedback.</p>}
      </ActionForm>
    </div>
  );
}

import Link from "next/link";
import clsx from "clsx";
import { z } from "zod";
import { TICKET_CATEGORIES, type TicketCategory } from "@zentro/commerce/support";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { maskEmail } from "@/lib/mask";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Support" };

const STATUS = { open: "Open", in_progress: "In progress", awaiting_customer: "Waiting on customer", resolved: "Resolved", closed: "Closed" } as const;
const PRIORITY_TONE: Record<string, string> = { urgent: "bg-bad-50 text-bad-700", high: "bg-warn-50 text-warn-700", normal: "bg-canvas text-ink-muted", low: "bg-canvas text-ink-subtle" };

export default async function SupportQueue({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("support.manage");
  const sp = await searchParams;
  const view = z.enum(["active", "mine", "unassigned", "awaiting_customer", "resolved"]).safeParse(sp.view).data ?? "active";
  const q = sp.q?.trim().toLowerCase().replace(/[%_\\]/g, "").slice(0, 100) || undefined;
  const sql = db();
  const rows = await sql<{ id: string; number: string; subject: string; name: string; email: string; category: TicketCategory; status: keyof typeof STATUS; priority: string; assignee: string | null; lastCustomer: Date | null; createdAt: Date; updatedAt: Date }[]>`
    select t.id, t.ticket_number as number, t.subject, t.name, t.email, t.category, t.status, t.priority, u.full_name as assignee,
           t.last_customer_message_at as "lastCustomer", t.created_at as "createdAt", t.updated_at as "updatedAt"
    from shop.support_tickets t left join shop.staff_users u on u.id = t.assigned_to
    where true
      ${view === "active" ? sql`and t.status in ('open','in_progress')` : sql``}
      ${view === "mine" ? sql`and t.assigned_to = ${s.staffId} and t.status not in ('resolved','closed')` : sql``}
      ${view === "unassigned" ? sql`and t.assigned_to is null and t.status not in ('resolved','closed')` : sql``}
      ${view === "awaiting_customer" ? sql`and t.status = 'awaiting_customer'` : sql``}
      ${view === "resolved" ? sql`and t.status in ('resolved','closed')` : sql``}
      ${q ? sql`and (lower(t.ticket_number) like ${"%" + q + "%"} or lower(t.subject) like ${"%" + q + "%"} or t.email like ${"%" + q + "%"})` : sql``}
    order by array_position(array['urgent','high','normal','low'], t.priority), coalesce(t.last_customer_message_at, t.created_at)
    limit 200`;
  const pii = s.permissions.has("customers.pii");
  const tabs: [typeof view, string][] = [["active", "Needs reply"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["awaiting_customer", "Waiting on customer"], ["resolved", "Resolved"]];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Support</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Ticket views" className="flex flex-wrap gap-2">
          {tabs.map(([k, l]) => <Link key={k} href={`?view=${k}`} aria-current={k === view ? "page" : undefined} className={clsx("rounded-full px-3 py-1.5 text-sm font-semibold ring-1", k === view ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-line")}>{l}</Link>)}
        </nav>
        <form><input type="hidden" name="view" value={view} /><input name="q" defaultValue={q} placeholder="Ticket no., subject, email" className="input h-10 w-64 text-sm" /></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Request</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Assigned</th><th className="px-5 py-3 text-right">Waiting</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="px-5 py-3"><Link href={`/support/${t.id}`} className="font-semibold text-brand-700 hover:underline">{t.subject}</Link><span className="block text-xs text-ink-muted">{t.number} · {TICKET_CATEGORIES[t.category]}</span></td>
                <td className="px-3 py-3">{t.name}<span className="block text-xs text-ink-muted">{pii ? t.email : maskEmail(t.email)}</span></td>
                <td className="px-3 py-3"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", PRIORITY_TONE[t.priority])}>{t.priority}</span></td>
                <td className="px-3 py-3">{STATUS[t.status]}</td>
                <td className="px-3 py-3 text-ink-muted">{t.assignee ?? "—"}</td>
                <td className="px-5 py-3 text-right text-ink-muted">{timeAgo(t.lastCustomer ?? t.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

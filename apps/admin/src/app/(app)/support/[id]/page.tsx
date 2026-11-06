import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { z } from "zod";
import { TICKET_CATEGORIES, type TicketCategory } from "@zentro/commerce/support";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ticketAction } from "@/lib/actions/support";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { maskEmail, maskPhone } from "@/lib/mask";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("support.manage");
  const id = z.guid().safeParse((await params).id).data;
  const sql = db();
  const [t] = id ? await sql<{ id: string; number: string; subject: string; name: string; email: string; phone: string | null; category: TicketCategory; status: string; priority: string; assignedTo: string | null; orderId: string | null; orderNumber: string | null; customerId: string | null; createdAt: Date }[]>`
    select t.id, t.ticket_number as number, t.subject, t.name, t.email, t.phone, t.category, t.status, t.priority, t.assigned_to as "assignedTo",
           t.order_id as "orderId", o.order_number as "orderNumber", t.user_id as "customerId", t.created_at as "createdAt"
    from shop.support_tickets t left join shop.orders o on o.id = t.order_id where t.id = ${id}` : [];
  if (!t) notFound();
  const [messages, agents] = await Promise.all([
    sql<{ author: string; body: string; internal: boolean; staff: string | null; createdAt: Date }[]>`
      select m.author, m.body, m.internal, u.full_name as staff, m.created_at as "createdAt"
      from shop.ticket_messages m left join shop.staff_users u on u.id = m.staff_id where m.ticket_id = ${t.id} order by m.created_at`,
    sql<{ id: string; name: string }[]>`
      select u.id, u.full_name as name from shop.staff_users u join shop.admin_roles r on r.id = u.role_id
      where u.status = 'active' and 'support.manage' = any(r.permissions) order by u.full_name`,
  ]);
  const pii = s.permissions.has("customers.pii");
  return (
    <div className="space-y-5">
      <div>
        <Link href="/support" className="text-sm font-semibold text-brand-700 hover:underline">← Support</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t.subject}</h1>
        <p className="text-sm text-ink-muted">{t.number} · {TICKET_CATEGORIES[t.category]} · opened {formatDateTime(t.createdAt)}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ol className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className={clsx("rounded-2xl p-4 text-sm", m.internal ? "bg-warn-50 ring-1 ring-warn-700/20" : m.author === "customer" ? "bg-white ring-1 ring-line" : "ml-8 bg-brand-50")}>
                <p className="text-xs font-semibold text-ink-muted">{m.internal ? `Internal note · ${m.staff}` : m.author === "customer" ? t.name : `${m.staff ?? "Support"} (to customer)`} · {formatDateTime(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ol>
          <ActionForm action={ticketAction} className="card space-y-3 p-5">
            <input type="hidden" name="ticketId" value={t.id} />
            <label className="block text-sm font-medium">Reply<textarea name="body" rows={5} maxLength={5000} className="input mt-1.5 h-auto py-2" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" className="size-4 accent-brand-600" />Internal note (not sent to the customer)</label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium">Then set status
                <select name="status" defaultValue="" className="input mt-1.5 h-10 w-52"><option value="">Keep ({t.status.replace(/_/g, " ")})</option><option value="in_progress">In progress</option><option value="awaiting_customer">Waiting on customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
              </label>
              <SubmitButton>Send</SubmitButton>
            </div>
          </ActionForm>
        </div>
        <aside className="space-y-4">
          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Customer</h2>
            <p className="mt-2">{t.name}<br />{pii ? t.email : maskEmail(t.email)}{t.phone && <><br />{pii ? t.phone : maskPhone(t.phone)}</>}</p>
            {t.orderId && <p className="mt-2">Order <Link href={`/orders/${t.orderId}`} className="font-semibold text-brand-700 hover:underline">{t.orderNumber}</Link></p>}
            {t.customerId && s.permissions.has("customers.read") && <p className="mt-2"><Link href={`/customers/${t.customerId}`} className="font-semibold text-brand-700 hover:underline">Customer profile →</Link></p>}
          </section>
          <ActionForm action={ticketAction} className="card space-y-3 p-5 text-sm">
            <input type="hidden" name="ticketId" value={t.id} />
            <label className="block font-medium">Priority<select name="priority" defaultValue={t.priority} className="input mt-1.5 h-10"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="block font-medium">Assigned to<select name="assignTo" defaultValue={t.assignedTo ?? ""} className="input mt-1.5 h-10"><option value="">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <SubmitButton variant="secondary">Update</SubmitButton>
          </ActionForm>
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise, ORDER_STATUS_LABELS, stateName, type OrderStatus } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL } from "@/components/MessagesNav";
import { customerAction } from "@/lib/actions/customers";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { maskEmail, maskPhone } from "@/lib/mask";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("customers.read");
  const id = z.guid().safeParse((await params).id).data;
  const sql = db();
  const [c] = id ? await sql<{ id: string; name: string; email: string; phone: string | null; status: string; reason: string | null; emailVerified: Date | null; phoneVerified: Date | null; createdAt: Date; lastLogin: Date | null; sessions: number }[]>`
    select id, full_name as name, email, phone, status, restricted_reason as reason, email_verified_at as "emailVerified", phone_verified_at as "phoneVerified",
           created_at as "createdAt", last_login_at as "lastLogin",
           (select count(*)::int from shop.customer_sessions where customer_id = c.id and revoked_at is null and expires_at > now()) as sessions
    from shop.customers c where id = ${id} and status <> 'deleted'` : [];
  if (!c) notFound();
  const pii = s.permissions.has("customers.pii");
  const [orders, tickets, consents, addresses] = await Promise.all([
    sql<{ id: string; number: string; status: OrderStatus; total: number; createdAt: Date }[]>`select id, order_number as number, status, total_paise as total, created_at as "createdAt" from shop.orders where user_id = ${c.id} order by created_at desc limit 50`,
    sql<{ id: string; number: string; subject: string; status: string }[]>`select id, ticket_number as number, subject, status from shop.support_tickets where user_id = ${c.id} or email = ${c.email} order by created_at desc limit 20`,
    sql<{ channel: "sms" | "email" | "whatsapp"; status: string }[]>`select channel, status from shop.current_marketing_consent where recipient = any(${[c.email, c.phone].filter(Boolean) as string[]}::text[])`,
    sql<{ label: string | null; city: string; stateCode: string; pincode: string; line1: string }[]>`select label, city, state_code as "stateCode", pincode, line1 from shop.addresses where user_id = ${c.id}`,
  ]);
  const spent = orders.filter((o) => !["cancelled", "pending_payment", "payment_failed"].includes(o.status)).reduce((a, o) => a + o.total, 0);
  const manage = s.permissions.has("customers.manage");
  return (
    <div className="space-y-6">
      <div>
        <Link href="/customers" className="text-sm font-semibold text-brand-700 hover:underline">← Customers</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{c.name}</h1>
        <p className="text-sm text-ink-muted">{pii ? c.email : maskEmail(c.email)} {c.emailVerified ? "(verified)" : "(unverified)"}{c.phone && <> · {pii ? c.phone : maskPhone(c.phone)} {c.phoneVerified ? "(verified)" : ""}</>}</p>
        <p className="text-sm text-ink-muted">Joined {formatDateTime(c.createdAt)} · last sign-in {formatDateTime(c.lastLogin)} · {c.sessions} active session(s){c.status === "restricted" && <span className="font-semibold text-bad-700"> · Restricted: {c.reason}</span>}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">Orders · {formatPaise(spent)} lifetime</h2>
            {orders.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No orders.</p> : (
              <table className="mt-3 w-full text-sm"><tbody className="divide-y divide-line">
                {orders.map((o) => <tr key={o.id}><td className="py-2"><Link href={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.number}</Link></td><td className="py-2 text-ink-muted">{formatDateTime(o.createdAt)}</td><td className="py-2">{ORDER_STATUS_LABELS[o.status]}</td><td className="py-2 text-right">{formatPaise(o.total)}</td></tr>)}
              </tbody></table>
            )}
          </section>
          <section className="card p-5">
            <h2 className="font-semibold">Support history</h2>
            {tickets.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No requests.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{tickets.map((t) => <li key={t.id}><Link href={`/support/${t.id}`} className="font-semibold text-brand-700 hover:underline">{t.subject}</Link> <span className="text-ink-muted">· {t.number} · {t.status.replace(/_/g, " ")}</span></li>)}</ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Marketing consent</h2>
            <ul className="mt-2 space-y-1">{(["email", "sms", "whatsapp"] as const).map((ch) => <li key={ch}>{CHANNEL_LABEL[ch]}: <strong>{consents.find((x) => x.channel === ch)?.status === "granted" ? "subscribed" : "not subscribed"}</strong></li>)}</ul>
            {s.permissions.has("messages.consent") && <Link href={`/messages/consent?q=${encodeURIComponent(c.phone ?? c.email)}`} className="mt-2 inline-block text-brand-700 hover:underline">Consent history →</Link>}
          </section>
          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Saved addresses</h2>
            {addresses.length === 0 ? <p className="mt-2 text-ink-muted">None.</p> : <ul className="mt-2 space-y-1">{addresses.map((a, i) => <li key={i}>{a.label && <strong>{a.label}: </strong>}{pii ? `${a.line1}, ` : ""}{a.city}, {stateName(a.stateCode)} {a.pincode}</li>)}</ul>}
            <p className="mt-2 text-xs text-ink-muted">Customers manage their own addresses; corrections for an order are made on the order with a note.</p>
          </section>
          {manage && (
            <ActionForm action={customerAction} className="card space-y-3 p-5 text-sm">
              <h2 className="font-semibold">Account</h2>
              <input type="hidden" name="customerId" value={c.id} />
              <input name="reason" maxLength={300} placeholder="Reason (required to restrict)" className="input h-10 text-sm" />
              <div className="flex flex-wrap gap-2">
                {c.status === "active" ? <SubmitButton name="op" value="restrict" variant="danger" confirm="Restrict this account? The customer will be signed out and unable to sign in.">Restrict</SubmitButton> : <SubmitButton name="op" value="restore" variant="secondary">Restore</SubmitButton>}
                <SubmitButton name="op" value="signout" variant="secondary">Sign out everywhere</SubmitButton>
              </div>
            </ActionForm>
          )}
          {manage && (
            <section className="card space-y-3 p-5 text-sm">
              <h2 className="font-semibold">Privacy requests</h2>
              {pii && <a href={`/api/customers/${c.id}/export`} className="btn btn-secondary">Export all data (JSON)</a>}
              <ActionForm action={customerAction} className="space-y-2">
                <input type="hidden" name="customerId" value={c.id} />
                <label className="block font-medium">Erase personal data — type DELETE<input name="confirm" className="input mt-1.5 h-10" /></label>
                <SubmitButton name="op" value="delete" variant="danger" confirm="Erase this customer's personal data? This cannot be undone.">Process erasure request</SubmitButton>
              </ActionForm>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

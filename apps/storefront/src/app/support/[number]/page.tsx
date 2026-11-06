import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { TICKET_CATEGORIES, TICKET_STATUS_LABELS, verifyTicketToken, type TicketStatus } from "@zentro/commerce/support";
import { TicketReplyForm } from "@/components/support/SupportForms";
import { ticketSecret } from "@/lib/actions/support";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Support request", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function TicketPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; new?: string }> }) {
  const { number } = await params;
  const sp = await searchParams;
  const ok = sp.t ? verifyTicketToken(await ticketSecret(), number, sp.t) : false;
  const [t] = ok ? await db()<{ id: string; subject: string; category: keyof typeof TICKET_CATEGORIES; status: TicketStatus; createdAt: Date; orderNumber: string | null }[]>`
      select t.id, t.subject, t.category, t.status, t.created_at as "createdAt", o.order_number as "orderNumber"
      from shop.support_tickets t left join shop.orders o on o.id = t.order_id where t.ticket_number = ${number}` : [];
  if (!t) return <div className="container-page max-w-md py-16 text-center"><h1 className="font-display text-2xl font-bold">We couldn’t open this request</h1><p className="mt-2 text-ink-muted">Use the link from your email.</p></div>;
  const messages = await db()<{ author: "customer" | "support"; body: string; createdAt: Date }[]>`
    select author, body, created_at as "createdAt" from shop.ticket_messages where ticket_id = ${t.id} and not internal order by created_at`;
  return (
    <div className="container-page max-w-3xl py-8">
      {sp.new && <p role="status" className="mb-6 rounded-xl bg-success-50 p-4 text-sm text-success-700">Thanks — we’ve received your request. A confirmation with this page’s link is on its way to your email.</p>}
      <p className="text-sm text-ink-muted">Request {number} · {TICKET_CATEGORIES[t.category]}{t.orderNumber && <> · Order {t.orderNumber}</>}</p>
      <h1 className="font-display text-2xl font-bold tracking-tight">{t.subject}</h1>
      <p className="mt-1 text-sm font-semibold">{TICKET_STATUS_LABELS[t.status]}</p>
      <ol className="mt-6 space-y-3">
        {messages.map((m, i) => (
          <li key={i} className={clsx("max-w-[85%] rounded-2xl p-4 text-sm", m.author === "customer" ? "ml-auto bg-brand-50" : "bg-white ring-1 ring-line")}>
            <p className="text-xs font-semibold text-ink-muted">{m.author === "customer" ? "You" : "Zentro Support"} · {dt.format(m.createdAt)}</p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-card bg-white p-5 ring-1 ring-line">
        {t.status === "closed" || t.status === "resolved" ? <p className="mb-3 text-sm text-ink-muted">This request is {t.status}. Replying will reopen it.</p> : null}
        <TicketReplyForm ticketNumber={number} token={sp.t!} />
      </div>
      <p className="mt-6 text-center text-sm"><Link href="/help" className="font-semibold text-brand-700 hover:underline">Back to help centre</Link></p>
    </div>
  );
}

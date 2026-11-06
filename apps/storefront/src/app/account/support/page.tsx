import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TICKET_STATUS_LABELS, ticketToken, type TicketStatus } from "@zentro/commerce/support";
import { ticketSecret } from "@/lib/actions/support";
import { getCustomer } from "@/lib/customer";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "My support requests", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyTickets() {
  const c = await getCustomer();
  if (!c) redirect("/account/login?next=/account/support");
  const rows = await db()<{ number: string; subject: string; status: TicketStatus; updatedAt: Date }[]>`
    select ticket_number as number, subject, status, updated_at as "updatedAt" from shop.support_tickets
    where user_id = ${c.id} or (${c.emailVerified} and email = ${c.email}) order by updated_at desc limit 100`;
  const secret = await ticketSecret();
  return (
    <div className="container-page max-w-3xl py-8">
      <div className="flex items-end justify-between gap-3"><h1 className="font-display text-3xl font-bold tracking-tight">Support requests</h1><Link href="/support/new" className="inline-flex h-10 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">New request</Link></div>
      {rows.length === 0 ? <p className="mt-4 text-ink-muted">No requests yet.</p> : (
        <ul className="mt-6 space-y-3">{rows.map((r) => (
          <li key={r.number}><Link href={`/support/${r.number}?t=${ticketToken(secret, r.number)}`} className="flex justify-between gap-3 rounded-card bg-white p-4 ring-1 ring-line hover:ring-brand-200"><span><span className="font-semibold">{r.subject}</span><span className="block text-sm text-ink-muted">{r.number}</span></span><span className="text-sm">{TICKET_STATUS_LABELS[r.status]}</span></Link></li>
        ))}</ul>
      )}
    </div>
  );
}

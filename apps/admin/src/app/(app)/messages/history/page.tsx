import Link from "next/link";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { CHANNEL_LABEL, MessagesNav, MsgStatus } from "@/components/MessagesNav";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { maskEmail, maskPhone } from "@/lib/mask";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Message history" };
const PAGE = 50;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("messages.read");
  const sp = await searchParams;
  const channel = z.enum(["email", "sms", "whatsapp"]).safeParse(sp.channel).data;
  const status = z.enum(["queued", "sending", "sent", "delivered", "read", "failed", "skipped", "suppressed", "cancelled"]).safeParse(sp.status).data;
  const kind = z.enum(["transactional", "service", "promotional"]).safeParse(sp.kind).data;
  const q = sp.q?.trim().toLowerCase().replace(/[%_\\]/g, "").slice(0, 100) || undefined;
  const page = z.coerce.number().int().min(1).max(10000).safeParse(sp.page).data ?? 1;
  const sql = db();
  const rows = await sql<{ id: string; channel: string; recipient: string; template: string; kind: string; status: string; attempts: number; provider: string | null; providerMessageId: string | null; lastError: string | null; cost: number | null; createdAt: Date; sentAt: Date | null; deliveredAt: Date | null; campaign: string | null; campaignId: string | null }[]>`
    select m.id::text, m.channel, m.recipient, m.template, m.kind, m.status, m.attempts, m.provider, m.provider_message_id as "providerMessageId",
           m.last_error as "lastError", coalesce(m.actual_cost_paise, m.estimated_cost_paise) as cost, m.created_at as "createdAt",
           m.sent_at as "sentAt", m.delivered_at as "deliveredAt", c.name as campaign, m.campaign_id as "campaignId"
    from shop.notification_outbox m left join shop.message_campaigns c on c.id = m.campaign_id
    where true ${channel ? sql`and m.channel = ${channel}` : sql``} ${status ? sql`and m.status = ${status}` : sql``}
      ${kind ? sql`and m.kind = ${kind}` : sql``} ${q ? sql`and (m.recipient like ${"%" + q + "%"} or m.template like ${"%" + q + "%"})` : sql``}
    order by m.id desc limit ${PAGE + 1} offset ${(page - 1) * PAGE}`;
  const pii = s.permissions.has("customers.pii");
  const qs = (p: number) => "?" + new URLSearchParams(Object.entries({ channel, status, kind, q, page: p > 1 ? String(p) : undefined }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-5">
      <MessagesNav active="/messages/history" title="Message history" />
      <form className="card grid gap-3 p-4 md:grid-cols-5 md:items-end">
        <label className="text-sm font-medium">Search<input name="q" defaultValue={q} placeholder="Recipient or template" className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Channel<select name="channel" defaultValue={channel ?? ""} className="input mt-1.5 h-10"><option value="">All</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
        <label className="text-sm font-medium">Status<select name="status" defaultValue={status ?? ""} className="input mt-1.5 h-10"><option value="">All</option>{["queued", "sent", "delivered", "read", "failed", "skipped", "suppressed", "cancelled"].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="text-sm font-medium">Type<select name="kind" defaultValue={kind ?? ""} className="input mt-1.5 h-10"><option value="">All</option><option value="transactional">Order updates</option><option value="service">One-to-one</option><option value="promotional">Promotional</option></select></label>
        <button className="btn btn-primary h-10">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">When</th><th className="px-3 py-3">Message</th><th className="px-3 py-3">To</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Provider ID</th><th className="px-5 py-3 text-right">Cost</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, PAGE).map((m) => (
              <tr key={m.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{formatDateTime(m.createdAt)}{m.deliveredAt && <span className="block text-xs text-good-700">delivered {formatDateTime(m.deliveredAt)}</span>}</td>
                <td className="px-3 py-3"><span className="font-medium">{m.template.replace(/_/g, " ")}</span><span className="block text-xs text-ink-muted">{CHANNEL_LABEL[m.channel as "sms"]} · {m.kind}{m.campaignId && <> · <Link href={`/messages/campaigns/${m.campaignId}`} className="text-brand-700 hover:underline">{m.campaign}</Link></>}</span></td>
                <td className="px-3 py-3">{pii ? m.recipient : m.channel === "email" ? maskEmail(m.recipient) : maskPhone(m.recipient)}</td>
                <td className="px-3 py-3"><MsgStatus status={m.status} />{m.attempts > 1 && <span className="ml-1 text-xs text-ink-muted">{m.attempts} tries</span>}{m.lastError && <span className="mt-1 block max-w-xs text-xs text-ink-muted">{m.lastError}</span>}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-muted">{m.provider ? `${m.provider} ${m.providerMessageId ?? ""}` : "—"}</td>
                <td className="px-5 py-3 text-right tabular-nums">{m.cost !== null && ["sent", "delivered", "read"].includes(m.status) ? formatPaise(m.cost) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">No messages match.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex justify-between">
        {page > 1 ? <Link href={qs(page - 1)} className="btn btn-secondary">← Newer</Link> : <span />}
        {rows.length > PAGE && <Link href={qs(page + 1)} className="btn btn-secondary">Older →</Link>}
      </nav>
    </div>
  );
}

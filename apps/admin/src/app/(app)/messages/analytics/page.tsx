import { formatPaise } from "@zentro/commerce";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Campaign analytics" };

export default async function MessageAnalyticsPage() {
  await requirePermission("messages.read");
  const sql = db();
  const [rows, consentTrend] = await Promise.all([
    sql<{ id: string; name: string; channel: "sms" | "email" | "whatsapp"; eligible: number; sent: number; delivered: number; failed: number; notSent: number; cost: number; orders: number; revenue: number }[]>`
      select c.id, c.name, c.channel, coalesce(c.eligible_count, 0) as eligible,
             count(m.id) filter (where m.status in ('sent','delivered','read'))::int as sent,
             count(m.id) filter (where m.status in ('delivered','read'))::int as delivered,
             count(m.id) filter (where m.status = 'failed')::int as failed,
             count(m.id) filter (where m.status in ('skipped','suppressed'))::int as "notSent",
             coalesce(sum(coalesce(m.actual_cost_paise, m.estimated_cost_paise)) filter (where m.status in ('sent','delivered','read')), 0)::int as cost,
             (select count(distinct o.id)::int from shop.notification_outbox mm join shop.orders o
                on (case when mm.channel = 'email' then lower(o.email) else o.phone end) = mm.recipient
               and o.placed_at between mm.sent_at and mm.sent_at + interval '7 days' and o.payment_status = 'paid'
              where mm.campaign_id = c.id and mm.status in ('sent','delivered','read')) as orders,
             (select coalesce(sum(o.total_paise), 0)::int from shop.orders o where o.id in (
               select o2.id from shop.notification_outbox mm join shop.orders o2
                 on (case when mm.channel = 'email' then lower(o2.email) else o2.phone end) = mm.recipient
                and o2.placed_at between mm.sent_at and mm.sent_at + interval '7 days' and o2.payment_status = 'paid'
               where mm.campaign_id = c.id and mm.status in ('sent','delivered','read'))) as revenue
      from shop.message_campaigns c left join shop.notification_outbox m on m.campaign_id = c.id
      where c.status in ('sending','completed','cancelled')
      group by c.id order by c.created_at desc limit 50`,
    sql<{ channel: string; granted: number; withdrawn: number }[]>`
      select channel, count(*) filter (where status = 'granted')::int as granted, count(*) filter (where status = 'withdrawn')::int as withdrawn
      from shop.marketing_consents where created_at > now() - interval '30 days' group by channel`,
  ]);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/analytics" title="Campaign analytics" />
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Consent changes, last 30 days">
        {(["sms", "whatsapp", "email"] as const).map((ch) => {
          const c = consentTrend.find((x) => x.channel === ch);
          return <div key={ch} className="card p-5"><p className="text-sm text-ink-muted">{CHANNEL_LABEL[ch]} opt-ins · last 30 days</p><p className="mt-1 text-2xl font-bold">+{c?.granted ?? 0}</p><p className="text-xs text-ink-muted">{c?.withdrawn ?? 0} unsubscribed</p></div>;
        })}
      </section>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr><th className="px-5 py-3">Campaign</th><th className="px-3 py-3 text-right">Eligible</th><th className="px-3 py-3 text-right">Sent</th><th className="px-3 py-3 text-right">Delivered</th><th className="px-3 py-3 text-right">Failed</th><th className="px-3 py-3 text-right">Not sent</th><th className="px-3 py-3 text-right">Cost</th><th className="px-3 py-3 text-right">Orders (7d)</th><th className="px-5 py-3 text-right">Revenue (7d)</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3"><span className="font-semibold">{r.name}</span><span className="block text-xs text-ink-muted">{CHANNEL_LABEL[r.channel]}</span></td>
                <td className="px-3 py-3 text-right tabular-nums">{r.eligible}</td><td className="px-3 py-3 text-right tabular-nums">{r.sent}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.delivered} <span className="text-xs text-ink-muted">{pct(r.delivered, r.sent)}</span></td>
                <td className="px-3 py-3 text-right tabular-nums">{r.failed}</td><td className="px-3 py-3 text-right tabular-nums">{r.notSent}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatPaise(r.cost)}</td><td className="px-3 py-3 text-right tabular-nums">{r.orders}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatPaise(r.revenue)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-ink-muted">No campaigns have been sent yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">“Delivered” counts only provider-reported deliveries. Revenue is attributed to a campaign when a recipient pays for an order within 7 days of their message.</p>
    </div>
  );
}

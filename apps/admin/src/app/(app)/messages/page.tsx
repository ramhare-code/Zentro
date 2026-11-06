import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { providerStatus } from "@zentro/commerce/messaging";
import { CHANNEL_LABEL, MessagesNav, MsgStatus } from "@/components/MessagesNav";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { maskEmail, maskPhone } from "@/lib/mask";
import { providerEnv } from "@/lib/messaging-env";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Messaging" };

export default async function MessagesOverview() {
  const s = await requirePermission("messages.read");
  const sql = db();
  const providers = providerStatus(providerEnv());
  const [byChannel, consents, recent, pending] = await Promise.all([
    sql<{ channel: "email" | "sms" | "whatsapp"; total: number; sent: number; delivered: number; failed: number; notSent: number; cost: number }[]>`
      select channel, count(*)::int as total,
             count(*) filter (where status in ('sent','delivered','read'))::int as sent,
             count(*) filter (where status in ('delivered','read'))::int as delivered,
             count(*) filter (where status = 'failed')::int as failed,
             count(*) filter (where status in ('skipped','suppressed'))::int as "notSent",
             coalesce(sum(coalesce(actual_cost_paise, estimated_cost_paise)) filter (where status in ('sent','delivered','read')), 0)::int as cost
      from shop.notification_outbox where created_at > now() - interval '30 days' group by channel`,
    sql<{ channel: string; n: number }[]>`select channel, count(*)::int as n from shop.current_marketing_consent where status = 'granted' group by channel`,
    sql<{ id: string; channel: string; recipient: string; template: string; kind: string; status: string; createdAt: Date }[]>`
      select id::text, channel, recipient, template, kind, status, created_at as "createdAt" from shop.notification_outbox order by id desc limit 10`,
    sql<{ n: number }[]>`select count(*)::int as n from shop.message_campaigns where status = 'pending_approval'`,
  ]);
  const pii = s.permissions.has("customers.pii");
  const mask = (ch: string, r: string) => (pii ? r : ch === "email" ? maskEmail(r) : maskPhone(r));

  return (
    <div className="space-y-6">
      <MessagesNav active="/messages" title="Overview" />
      {(pending[0]?.n ?? 0) > 0 && <Link href="/messages/scheduled" className="block rounded-xl bg-warn-50 p-4 text-sm font-semibold text-warn-700">{pending[0]!.n} campaign(s) waiting for approval →</Link>}
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Channels">
        {(["email", "sms", "whatsapp"] as const).map((ch) => {
          const c = byChannel.find((b) => b.channel === ch);
          const p = providers[ch];
          return (
            <div key={ch} className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{CHANNEL_LABEL[ch]}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.configured ? "bg-good-50 text-good-700" : "bg-warn-50 text-warn-700"}`}>{p.configured ? `${p.provider} connected` : "Not connected"}</span>
              </div>
              {!p.configured && <p className="mt-2 text-xs text-ink-muted">Messages are recorded as “skipped” until {p.missing.join(", ")} {p.missing.length > 1 ? "are" : "is"} set.</p>}
              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-muted">Last 30 days</dt><dd className="text-right font-semibold">{c?.total ?? 0}</dd>
                <dt className="text-ink-muted">Accepted by provider</dt><dd className="text-right">{c?.sent ?? 0}</dd>
                <dt className="text-ink-muted">Delivered (reported)</dt><dd className="text-right">{c?.delivered ?? 0}</dd>
                <dt className="text-ink-muted">Failed</dt><dd className="text-right">{c?.failed ?? 0}</dd>
                <dt className="text-ink-muted">Not sent</dt><dd className="text-right">{c?.notSent ?? 0}</dd>
                <dt className="text-ink-muted">Cost (est./actual)</dt><dd className="text-right">{formatPaise(c?.cost ?? 0)}</dd>
                <dt className="text-ink-muted">Opted in to offers</dt><dd className="text-right font-semibold">{consents.find((x) => x.channel === ch)?.n ?? 0}</dd>
              </dl>
            </div>
          );
        })}
      </section>
      <section className="card p-5">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Latest messages</h2><Link href="/messages/history" className="text-sm font-semibold text-brand-700 hover:underline">All history →</Link></div>
        {recent.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No messages yet. Order updates appear here automatically.</p> : (
          <table className="mt-3 w-full text-sm"><tbody className="divide-y divide-line">
            {recent.map((m) => <tr key={m.id}><td className="py-2">{m.template.replace(/_/g, " ")}</td><td className="py-2 text-ink-muted">{CHANNEL_LABEL[m.channel as "sms"]} · {m.kind}</td><td className="py-2 text-ink-muted">{mask(m.channel, m.recipient)}</td><td className="py-2"><MsgStatus status={m.status} /></td><td className="py-2 text-right text-ink-muted">{formatDateTime(m.createdAt)}</td></tr>)}
          </tbody></table>
        )}
      </section>
    </div>
  );
}

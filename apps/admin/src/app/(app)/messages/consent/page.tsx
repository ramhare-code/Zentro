import { normaliseRecipient } from "@zentro/commerce/messaging";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { withdrawConsentAction } from "@/lib/actions/messages";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Consent & unsubscribes" };

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requirePermission("messages.consent");
  const q = (await searchParams).q?.trim() ?? "";
  const sql = db();
  const totals = await sql<{ channel: "sms" | "email" | "whatsapp"; n: number }[]>`select channel, count(*)::int as n from shop.current_marketing_consent where status = 'granted' group by channel`;
  const recipient = q.includes("@") ? normaliseRecipient("email", q) : normaliseRecipient("sms", q);
  const history = recipient
    ? await sql<{ channel: "sms" | "email" | "whatsapp"; status: string; source: string; wording: string | null; createdAt: Date; staff: string | null }[]>`
        select c.channel, c.status, c.source, c.wording, c.created_at as "createdAt", u.email as staff
        from shop.marketing_consents c left join shop.staff_users u on u.id = c.staff_id
        where c.recipient = ${recipient} order by c.id desc`
    : [];
  const current = (["sms", "whatsapp", "email"] as const).map((ch) => ({ ch, row: history.find((h) => h.channel === ch) }));
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/consent" title="Consent & unsubscribes" />
      <section className="grid gap-4 sm:grid-cols-3">
        {(["sms", "whatsapp", "email"] as const).map((ch) => <div key={ch} className="card p-5"><p className="text-sm text-ink-muted">Opted in to {CHANNEL_LABEL[ch]} offers</p><p className="mt-1 text-2xl font-bold">{totals.find((t) => t.channel === ch)?.n ?? 0}</p></div>)}
      </section>
      <p className="text-sm text-ink-muted">Consent is recorded only by the customer (checkout opt-in). Every grant and withdrawal is kept permanently as evidence. Staff can record a withdrawal when a customer asks by phone or email; staff can never opt a customer in.</p>
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-sm font-medium">Look up a customer<input name="q" defaultValue={q} placeholder="Mobile number or email" className="input mt-1.5 h-10" /></label>
        <button className="btn btn-primary h-10">Look up</button>
      </form>
      {q && !recipient && <p className="text-sm text-bad-700">Enter a valid 10-digit mobile number or email.</p>}
      {recipient && (
        <section className="card p-5">
          <h2 className="font-semibold">{recipient}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {current.map(({ ch, row }) => {
              const applies = ch === "email" ? recipient.includes("@") : !recipient.includes("@");
              if (!applies) return null;
              const on = row?.status === "granted";
              return (
                <div key={ch} className="rounded-xl bg-canvas p-4 text-sm">
                  <p className="font-semibold">{CHANNEL_LABEL[ch]}: <span className={on ? "text-good-700" : "text-ink-muted"}>{on ? "subscribed" : "not subscribed"}</span></p>
                  {on && (
                    <ActionForm action={withdrawConsentAction} className="mt-2 space-y-2">
                      <input type="hidden" name="channel" value={ch} /><input type="hidden" name="recipient" value={recipient} />
                      <input name="note" maxLength={200} placeholder="How the customer asked (optional)" className="input h-9 text-sm" />
                      <SubmitButton variant="secondary" className="h-9">Record unsubscribe</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              );
            })}
          </div>
          <h3 className="mt-6 text-sm font-semibold">Consent history</h3>
          {history.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No consent records.</p> : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {history.map((h, i) => <li key={i} className="py-2"><span className="font-medium">{CHANNEL_LABEL[h.channel]} {h.status}</span> · via {h.source.replace(/_/g, " ")}{h.staff && ` by ${h.staff}`} · <span className="text-ink-muted">{formatDateTime(h.createdAt)}</span>{h.wording && <span className="block text-xs text-ink-muted">“{h.wording}”</span>}</li>)}
            </ul>
          )}
        </section>
      )}
      {void s}
    </div>
  );
}

import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { PaymentsNav, PayStatus } from "@/components/PaymentsNav";
import { SettlementForm } from "@/components/payments/SettlementForm";
import { checkPaymentAction } from "@/lib/actions/payments";
import { db } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payment reconciliation" };

export default async function ReconcilePage() {
  const s = await requirePermission("payments.read");
  const canAct = s.permissions.has("payments.reconcile");
  const sql = db();
  const [stuck, unsettled, imports] = await Promise.all([
    sql<{ id: string; orderNumber: string; amount: number; status: string; createdAt: Date; lastCheckedAt: Date | null; orderStatus: string }[]>`
      select p.id, o.order_number as "orderNumber", p.amount_paise as amount, p.status, p.created_at as "createdAt", p.last_checked_at as "lastCheckedAt", o.status as "orderStatus"
      from shop.payments p join shop.orders o on o.id = p.order_id
      where p.status in ('created','authorized') and o.payment_status <> 'paid' and p.created_at between now() - interval '7 days' and now() - interval '30 minutes'
      order by p.created_at desc limit 100`,
    sql<{ id: string; orderNumber: string; amount: number; providerPaymentId: string; verifiedAt: Date }[]>`
      select p.id, o.order_number as "orderNumber", p.amount_paise as amount, p.provider_payment_id as "providerPaymentId", p.verified_at as "verifiedAt"
      from shop.payments p join shop.orders o on o.id = p.order_id
      where p.status = 'captured' and p.settled_at is null and p.verified_at < now() - interval '4 days' order by p.verified_at limit 100`,
    sql<{ id: string; fileName: string; rows: number; matched: number; mismatched: number; unknown: number; fees: number; settled: number; createdAt: Date; by: string | null }[]>`
      select i.id, i.file_name as "fileName", i.rows_total as rows, i.matched, i.mismatched, i.unknown, i.fees_paise::float8 as fees, i.settled_paise::float8 as settled, i.created_at as "createdAt", u.full_name as by
      from shop.settlement_imports i left join shop.staff_users u on u.id = i.created_by order by i.created_at desc limit 20`,
  ]);
  return (
    <div className="space-y-5">
      <PaymentsNav active="/payments/reconcile" title="Reconciliation" />
      <section aria-labelledby="stuck" className="card p-5">
        <h2 id="stuck" className="font-semibold">Unconfirmed payment attempts</h2>
        <p className="mt-1 text-sm text-ink-muted">Started over 30 minutes ago with no confirmation. Usually the customer gave up, but if their browser closed after paying and the webhook was missed, a check with Razorpay confirms the order. The scheduled job also checks these automatically every few minutes.</p>
        {/* one form for the list: a confirmed attempt drops off the list, but the result message stays */}
        <ActionForm action={checkPaymentAction} className="mt-3">
          {stuck.length === 0 ? <p className="text-sm text-ink-muted">Nothing waiting.</p> : (
            <ul className="divide-y divide-line text-sm">
              {stuck.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Link href={`/payments/${p.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{p.orderNumber}</Link> <PayStatus status={p.status} /> <span className="tabular-nums">{formatPaise(p.amount)}</span>
                    <span className="block text-xs text-ink-muted">Started {timeAgo(p.createdAt)} · order {p.orderStatus.replace(/_/g, " ")}{p.lastCheckedAt && ` · checked ${timeAgo(p.lastCheckedAt)}`}</span></span>
                  {canAct && <SubmitButton name="paymentId" value={p.id} variant="secondary" className="h-9">Check with Razorpay</SubmitButton>}
                </li>
              ))}
            </ul>
          )}
        </ActionForm>
      </section>
      {canAct && <SettlementForm />}
      <section aria-labelledby="unsettled" className="card p-5">
        <h2 id="unsettled" className="font-semibold">Captured but not yet matched to a settlement</h2>
        <p className="mt-1 text-sm text-ink-muted">Razorpay normally settles within 2–3 working days. These were captured over 4 days ago and haven’t appeared in an imported report.</p>
        {unsettled.length === 0 ? <p className="mt-3 text-sm text-ink-muted">All matched (or no report imported yet for older payments).</p> : (
          <ul className="mt-3 divide-y divide-line text-sm">{unsettled.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2"><Link href={`/payments/${p.id}`} className="font-mono text-brand-700 hover:underline">{p.orderNumber}</Link><code className="text-xs text-ink-muted">{p.providerPaymentId}</code><span className="tabular-nums">{formatPaise(p.amount)}</span><span className="text-ink-muted">{formatDateTime(p.verifiedAt)}</span></li>)}</ul>
        )}
      </section>
      <section aria-labelledby="imports" className="card p-5">
        <h2 id="imports" className="font-semibold">Imported reports</h2>
        {imports.length === 0 ? <p className="mt-3 text-sm text-ink-muted">None yet.</p> : (
          <ul className="mt-3 divide-y divide-line text-sm">{imports.map((i) => <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-medium">{i.fileName}</span><span className="text-ink-muted">{i.matched}/{i.rows} matched{i.mismatched + i.unknown > 0 && `, ${i.mismatched + i.unknown} flagged`} · fees {formatPaise(i.fees)} · net {formatPaise(i.settled)}</span><span className="text-ink-muted">{formatDateTime(i.createdAt)}{i.by && ` · ${i.by}`}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

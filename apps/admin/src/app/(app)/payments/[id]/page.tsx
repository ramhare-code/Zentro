import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { PaymentsNav, PayStatus } from "@/components/PaymentsNav";
import { checkPaymentAction } from "@/lib/actions/payments";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payment" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("payments.read");
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const sql = db();
  const [p] = await sql<{ orderId: string; orderNumber: string; orderStatus: string; orderPayment: string; orderTotal: number; providerOrderId: string; providerPaymentId: string | null; amount: number; status: string; method: string | null; errorCode: string | null; errorDescription: string | null; verifiedAt: Date | null; createdAt: Date; fee: number | null; tax: number | null; settlementId: string | null; settledAt: Date | null; lastCheckedAt: Date | null }[]>`
    select o.id as "orderId", o.order_number as "orderNumber", o.status as "orderStatus", o.payment_status as "orderPayment", o.total_paise as "orderTotal",
           p.provider_order_id as "providerOrderId", p.provider_payment_id as "providerPaymentId", p.amount_paise as amount, p.status, p.method,
           p.error_code as "errorCode", p.error_description as "errorDescription", p.verified_at as "verifiedAt", p.created_at as "createdAt",
           p.fee_paise as fee, p.gateway_tax_paise as tax, p.settlement_id as "settlementId", p.settled_at as "settledAt", p.last_checked_at as "lastCheckedAt"
    from shop.payments p join shop.orders o on o.id = p.order_id where p.id = ${id}`;
  if (!p) notFound();
  const [refunds, attempts, events] = await Promise.all([
    sql<{ id: string; amount: number; status: string; reason: string | null; providerRefundId: string | null; createdAt: Date }[]>`
      select id, amount_paise as amount, status, reason, provider_refund_id as "providerRefundId", created_at as "createdAt" from shop.refunds where payment_id = ${id} order by created_at`,
    sql<{ id: string; status: string; createdAt: Date }[]>`select id, status, created_at as "createdAt" from shop.payments where order_id = ${p.orderId} and id <> ${id} order by created_at`,
    sql<{ id: number; type: string; receivedAt: Date; processed: boolean; error: string | null }[]>`
      select id, event_type as type, received_at as "receivedAt", processed_at is not null as processed, error from shop.payment_webhook_events
      where payload->'payload'->'payment'->'entity'->>'order_id' = ${p.providerOrderId}
         or (${p.providerPaymentId}::text is not null and payload->'payload'->'refund'->'entity'->>'payment_id' = ${p.providerPaymentId})
      order by id limit 50`,
  ]);
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-4 py-1.5"><dt className="text-ink-muted">{k}</dt><dd className="text-right">{v}</dd></div>;
  return (
    <div className="space-y-5">
      <PaymentsNav active="/payments" title={`Payment · ${p.orderNumber}`}><PayStatus status={p.status} /></PaymentsNav>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5 text-sm"><h2 className="font-semibold">Payment</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row k="Amount" v={<span className="font-semibold tabular-nums">{formatPaise(p.amount)}</span>} />
            <Row k="Razorpay order" v={<code className="text-xs">{p.providerOrderId}</code>} />
            <Row k="Razorpay payment" v={p.providerPaymentId ? <code className="text-xs">{p.providerPaymentId}</code> : "—"} />
            <Row k="Method" v={<span className="capitalize">{p.method ?? "—"}</span>} />
            <Row k="Started" v={formatDateTime(p.createdAt)} />
            <Row k="Verified with Razorpay" v={formatDateTime(p.verifiedAt)} />
            {(p.errorCode || p.errorDescription) && <Row k="Failure" v={<span className="text-bad-700">{p.errorDescription ?? p.errorCode}</span>} />}
            <Row k="Gateway fee (incl. GST)" v={p.fee !== null ? `${formatPaise(p.fee)}${p.tax !== null ? ` (GST ${formatPaise(p.tax)})` : ""}` : "Not known yet"} />
            <Row k="Settlement" v={p.settledAt ? <>{formatDateTime(p.settledAt)}{p.settlementId && <code className="ml-1 text-xs">{p.settlementId}</code>}</> : "Not matched yet"} />
            <Row k="Net to you" v={p.fee !== null && ["captured", "partially_refunded"].includes(p.status) ? formatPaise(p.amount - p.fee - refunds.filter((r) => r.status === "processed").reduce((a, r) => a + r.amount, 0)) : "—"} />
          </dl>
        </section>
        <section className="space-y-5">
          <div className="card p-5 text-sm"><h2 className="font-semibold">Order</h2>
            <p className="mt-2"><Link href={`/orders/${p.orderId}`} className="font-mono font-semibold text-brand-700 hover:underline">{p.orderNumber}</Link> · {p.orderStatus.replace(/_/g, " ")} · payment {p.orderPayment.replace(/_/g, " ")} · total {formatPaise(p.orderTotal)}</p>
            {attempts.length > 0 && <p className="mt-2 text-xs text-ink-muted">Other attempts: {attempts.map((a, i) => <span key={a.id}>{i > 0 && ", "}<Link href={`/payments/${a.id}`} className="underline">{a.status} {formatDateTime(a.createdAt)}</Link></span>)}</p>}
          </div>
          {s.permissions.has("payments.reconcile") && (
            <ActionForm action={checkPaymentAction} className="card p-5 text-sm">
              <input type="hidden" name="paymentId" value={id} />
              <h2 className="font-semibold">Check with Razorpay</h2>
              <p className="mt-1 text-ink-muted">Fetches this attempt’s real status from Razorpay and applies it the same way a verified webhook would. Safe to repeat. {p.lastCheckedAt && `Last checked ${formatDateTime(p.lastCheckedAt)}.`}</p>
              <div className="mt-3"><SubmitButton variant="secondary">Check now</SubmitButton></div>
            </ActionForm>
          )}
        </section>
      </div>
      <section className="card p-5 text-sm"><h2 className="font-semibold">Refunds</h2>
        {refunds.length === 0 ? <p className="mt-2 text-ink-muted">None.</p> : <ul className="mt-2 divide-y divide-line">{refunds.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{formatPaise(r.amount)} · {r.status}{r.reason && ` · ${r.reason}`}</span><span className="text-ink-muted">{r.providerRefundId ? <code className="text-xs">{r.providerRefundId}</code> : "not yet submitted"} · {formatDateTime(r.createdAt)}</span></li>)}</ul>}
      </section>
      <section className="card p-5 text-sm"><h2 className="font-semibold">Gateway events</h2>
        {events.length === 0 ? <p className="mt-2 text-ink-muted">No webhook events received for this attempt.</p> : <ul className="mt-2 divide-y divide-line">{events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><code className="text-xs">{e.type}</code><span className={e.error && !e.processed ? "text-bad-700" : "text-ink-muted"}>{e.processed ? "processed" : e.error ? `failed: ${e.error}` : "received"} · {formatDateTime(e.receivedAt)}</span></li>)}</ul>}
      </section>
    </div>
  );
}

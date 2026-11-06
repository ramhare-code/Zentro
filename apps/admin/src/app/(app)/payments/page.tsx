import Link from "next/link";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { PaymentsNav, PayStatus } from "@/components/PaymentsNav";
import { RangePicker } from "@/components/RangePicker";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { parseRange } from "@/lib/metrics";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payments" };
const STATUSES = ["created", "authorized", "captured", "failed", "refunded", "partially_refunded"] as const;

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = <><p className="text-sm text-ink-muted">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}</>;
  return href ? <Link href={href} className="card block p-4 hover:ring-brand-200">{body}</Link> : <div className="card p-4">{body}</div>;
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("payments.read");
  const sp = await searchParams;
  const range = parseRange(sp);
  const status = z.enum(STATUSES).safeParse(sp.status).data;
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const sql = db();
  const inRange = sql`(p.created_at at time zone 'Asia/Kolkata')::date between ${range.from}::date and ${range.to}::date`;
  const [[sum], methods, reasons, [attention], rows] = await Promise.all([
    sql<{ attempts: number; captured: number; capturedPaise: number; failed: number; feesPaise: number; uncostedFees: number; ordersTried: number; ordersPaid: number; refundedPaise: number }[]>`
      select count(*)::int as attempts, count(*) filter (where p.status in ('captured','refunded','partially_refunded'))::int as captured,
             coalesce(sum(p.amount_paise) filter (where p.status in ('captured','refunded','partially_refunded')), 0)::bigint::float8 as "capturedPaise",
             count(*) filter (where p.status = 'failed')::int as failed,
             coalesce(sum(p.fee_paise), 0)::bigint::float8 as "feesPaise",
             count(*) filter (where p.status in ('captured','refunded','partially_refunded') and p.fee_paise is null)::int as "uncostedFees",
             count(distinct p.order_id)::int as "ordersTried",
             count(distinct p.order_id) filter (where p.status in ('captured','refunded','partially_refunded'))::int as "ordersPaid",
             (select coalesce(sum(r.amount_paise), 0)::bigint::float8 from shop.refunds r where r.status = 'processed'
                and (r.processed_at at time zone 'Asia/Kolkata')::date between ${range.from}::date and ${range.to}::date) as "refundedPaise"
      from shop.payments p where ${inRange}`,
    sql<{ method: string; n: number; paise: number }[]>`
      select coalesce(p.method, 'unknown') as method, count(*)::int as n, sum(p.amount_paise)::bigint::float8 as paise
      from shop.payments p where ${inRange} and p.status in ('captured','refunded','partially_refunded') group by 1 order by 2 desc`,
    sql<{ reason: string; n: number }[]>`
      select coalesce(p.error_description, p.error_code, 'No reason given') as reason, count(*)::int as n
      from shop.payments p where ${inRange} and p.status = 'failed' group by 1 order by 2 desc limit 6`,
    sql<{ stuck: number; unsettled: number; refundsStuck: number; webhookErrors: number }[]>`
      select (select count(*)::int from shop.payments p join shop.orders o on o.id = p.order_id
                where p.status in ('created','authorized') and o.payment_status <> 'paid' and p.created_at between now() - interval '7 days' and now() - interval '30 minutes') as stuck,
             (select count(*)::int from shop.payments where status = 'captured' and settled_at is null and verified_at < now() - interval '4 days') as unsettled,
             (select count(*)::int from shop.refunds where status = 'pending' and provider_refund_id is null) as "refundsStuck",
             (select count(*)::int from shop.payment_webhook_events where error is not null and processed_at is null) as "webhookErrors"`,
    sql<{ id: string; orderId: string; orderNumber: string; providerOrderId: string; providerPaymentId: string | null; amount: number; status: string; method: string | null; error: string | null; createdAt: Date; fee: number | null; settled: boolean }[]>`
      select p.id, o.id as "orderId", o.order_number as "orderNumber", p.provider_order_id as "providerOrderId", p.provider_payment_id as "providerPaymentId",
             p.amount_paise as amount, p.status, p.method, coalesce(p.error_description, p.error_code) as error, p.created_at as "createdAt", p.fee_paise as fee, p.settled_at is not null as settled
      from shop.payments p join shop.orders o on o.id = p.order_id
      where ${inRange} ${status ? sql`and p.status = ${status}` : sql``}
        ${q ? sql`and (o.order_number = ${q.toUpperCase()} or p.provider_payment_id = ${q} or p.provider_order_id = ${q})` : sql``}
      order by p.created_at desc limit 200`,
  ]);
  const s = sum!, a = attention!;
  const successRate = s.ordersTried ? Math.round((s.ordersPaid / s.ordersTried) * 1000) / 10 : null;
  const keep = (extra: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ range: range.key === "custom" ? undefined : range.key, from: range.key === "custom" ? range.from : undefined, to: range.key === "custom" ? range.to : undefined, ...extra }).filter(([, v]) => v) as [string, string][]);
  return (
    <div className="space-y-5">
      <PaymentsNav active="/payments" title="Payments"><RangePicker range={range} /></PaymentsNav>
      {(a.stuck || a.unsettled || a.refundsStuck || a.webhookErrors) > 0 && (
        <section aria-label="Needs attention" className="card flex flex-wrap gap-x-6 gap-y-2 border-l-4 border-warn-500 p-4 text-sm">
          {a.stuck > 0 && <Link href="/payments/reconcile" className="font-semibold text-warn-700 underline">{a.stuck} unconfirmed payment attempt(s) over 30 min old</Link>}
          {a.webhookErrors > 0 && <Link href="/payments/webhooks?failed=1" className="font-semibold text-bad-700 underline">{a.webhookErrors} gateway event(s) failed to process</Link>}
          {a.refundsStuck > 0 && <Link href="/refunds" className="font-semibold text-bad-700 underline">{a.refundsStuck} refund(s) not yet submitted to Razorpay</Link>}
          {a.unsettled > 0 && <Link href="/payments/reconcile" className="font-semibold text-warn-700 underline">{a.unsettled} captured payment(s) not matched to a settlement after 4 days</Link>}
        </section>
      )}
      <section aria-label="Payment summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Captured" value={formatPaise(s.capturedPaise)} sub={`${s.captured} payment(s)`} />
        <Stat label="Checkout success rate" value={successRate === null ? "—" : `${successRate}%`} sub={`${s.ordersPaid} of ${s.ordersTried} order(s) that started paying`} />
        <Stat label="Failed attempts" value={String(s.failed)} sub={`of ${s.attempts} attempt(s)`} href={keep({ status: "failed" })} />
        <Stat label="Gateway fees" value={formatPaise(s.feesPaise)} sub={s.uncostedFees ? `${s.uncostedFees} payment(s) without fee data yet` : "From Razorpay"} />
        <Stat label="Refunded" value={formatPaise(s.refundedPaise)} sub="Processed in this period" />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5"><h2 className="font-semibold">By payment method</h2>
          {methods.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No captured payments in this period.</p> : (
            <ul className="mt-3 space-y-2 text-sm">{methods.map((m) => (
              <li key={m.method} className="flex items-center gap-3"><span className="w-24 capitalize">{m.method}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, (m.paise / Math.max(1, s.capturedPaise)) * 100)}%` }} /></span>
                <span className="w-32 text-right tabular-nums">{formatPaise(m.paise)} · {m.n}</span></li>))}</ul>)}
        </section>
        <section className="card p-5"><h2 className="font-semibold">Why payments failed</h2>
          {reasons.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No failed payments in this period.</p> : (
            <ul className="mt-3 divide-y divide-line text-sm">{reasons.map((r) => <li key={r.reason} className="flex justify-between gap-3 py-1.5"><span>{r.reason}</span><span className="tabular-nums text-ink-muted">{r.n}</span></li>)}</ul>)}
        </section>
      </div>
      <form className="card flex flex-wrap items-end gap-3 p-4">
        {range.key === "custom" ? <><input type="hidden" name="from" value={range.from} /><input type="hidden" name="to" value={range.to} /></> : <input type="hidden" name="range" value={range.key} />}
        <label className="flex-1 text-sm font-medium">Order number or Razorpay id<input name="q" defaultValue={q} placeholder="ZN… / pay_… / order_…" className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Status<select name="status" defaultValue={status ?? ""} className="input mt-1.5 h-10 w-48"><option value="">All</option>{STATUSES.map((x) => <option key={x} value={x}>{x.replace(/_/g, " ")}</option>)}</select></label>
        <button className="btn btn-primary h-10">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">When</th><th className="px-3 py-3">Order</th><th className="px-3 py-3">Razorpay</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3 text-right">Fee</th><th className="px-5 py-3">Settled</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-2.5 text-ink-muted"><Link href={`/payments/${r.id}`} className="text-brand-700 hover:underline">{formatDateTime(r.createdAt)}</Link></td>
                <td className="px-3 py-2.5"><Link href={`/orders/${r.orderId}`} className="font-mono text-brand-700 hover:underline">{r.orderNumber}</Link></td>
                <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{r.providerPaymentId ?? r.providerOrderId}</td>
                <td className="px-3 py-2.5"><PayStatus status={r.status} />{r.method && <span className="ml-1 text-xs capitalize text-ink-muted">{r.method}</span>}{r.error && <span className="block max-w-xs truncate text-xs text-bad-700">{r.error}</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(r.amount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{r.fee !== null ? formatPaise(r.fee) : "—"}</td>
                <td className="px-5 py-2.5 text-ink-muted">{r.settled ? "Yes" : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-ink-muted">No payment attempts match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-subtle">Every payment is verified with Razorpay on the server (signature + fetching the payment) before an order is confirmed. Amounts here come from those verified records.</p>
    </div>
  );
}

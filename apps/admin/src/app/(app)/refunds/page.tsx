import Link from "next/link";
import clsx from "clsx";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { retryRefundAction } from "@/lib/actions/returns";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Refunds" };

export default async function RefundsPage() {
  await requirePermission("refunds.create");
  const rows = await db()<{ id: string; orderId: string; orderNumber: string; amount: number; status: string; providerRefundId: string | null; reason: string | null; createdAt: Date; processedAt: Date | null; fromReturn: boolean }[]>`
    select f.id, o.id as "orderId", o.order_number as "orderNumber", f.amount_paise as amount, f.status, f.provider_refund_id as "providerRefundId",
           f.reason, f.created_at as "createdAt", f.processed_at as "processedAt", (f.return_request_id is not null) as "fromReturn"
    from shop.refunds f join shop.orders o on o.id = f.order_id order by (f.status <> 'processed') desc, f.created_at desc limit 200`;
  const tone: Record<string, string> = { processed: "bg-good-50 text-good-700", pending: "bg-warn-50 text-warn-700", failed: "bg-bad-50 text-bad-700" };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Refunds</h1>
        <p className="mt-1 text-sm text-ink-muted">Every refund is issued through Razorpay; status comes only from Razorpay’s response or its signed webhook. Pending refunds without a Razorpay ID, and failed ones, can be retried.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Order</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Why</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Razorpay ID</th><th className="px-5 py-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3"><Link href={`/orders/${r.orderId}`} className="font-semibold text-brand-700 hover:underline">{r.orderNumber}</Link><span className="block text-xs text-ink-muted">{formatDateTime(r.createdAt)}</span></td>
                <td className="px-3 py-3 font-semibold tabular-nums">{formatPaise(r.amount)}</td>
                <td className="px-3 py-3 text-ink-muted">{r.fromReturn ? "Return" : r.reason ?? "—"}</td>
                <td className="px-3 py-3"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", tone[r.status])}>{r.status}</span>{r.processedAt && <span className="block text-xs text-ink-muted">{formatDateTime(r.processedAt)}</span>}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-muted">{r.providerRefundId ?? "—"}</td>
                <td className="px-5 py-3 text-right">
                  {(r.status === "failed" || (r.status === "pending" && !r.providerRefundId)) && (
                    <ActionForm action={retryRefundAction}><input type="hidden" name="refundId" value={r.id} /><SubmitButton variant="secondary" className="h-9">Retry</SubmitButton></ActionForm>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">No refunds yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

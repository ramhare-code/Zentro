import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { PaymentsNav } from "@/components/PaymentsNav";
import { retryWebhookAction } from "@/lib/actions/payments";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Gateway events" };

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const s = await requirePermission("payments.read");
  const failedOnly = (await searchParams).failed === "1";
  const sql = db();
  const rows = await sql<{ id: number; eventId: string; type: string; receivedAt: Date; processedAt: Date | null; error: string | null; attempts: number; ref: string | null }[]>`
    select id, event_id as "eventId", event_type as type, received_at as "receivedAt", processed_at as "processedAt", error, attempts,
           coalesce(payload->'payload'->'payment'->'entity'->>'id', payload->'payload'->'refund'->'entity'->>'id') as ref
    from shop.payment_webhook_events where provider = 'razorpay' ${failedOnly ? sql`and error is not null and processed_at is null` : sql``}
    order by id desc limit 200`;
  const canRetry = s.permissions.has("payments.reconcile");
  return (
    <div className="space-y-5">
      <PaymentsNav active="/payments/webhooks" title="Gateway events" />
      <p className="max-w-3xl text-sm text-ink-muted">Every webhook Razorpay sends is checked against its signature and stored once. Events that failed to apply can be retried here; retries re-fetch the payment from Razorpay and can’t double-confirm or double-refund. Payload contents are not shown.</p>
      <nav className="flex gap-2 text-sm"><a href="/payments/webhooks" aria-current={!failedOnly ? "page" : undefined} className={`rounded-full px-3 py-1 ring-1 ${!failedOnly ? "bg-ink text-white ring-ink" : "ring-line"}`}>All</a><a href="/payments/webhooks?failed=1" aria-current={failedOnly ? "page" : undefined} className={`rounded-full px-3 py-1 ring-1 ${failedOnly ? "bg-ink text-white ring-ink" : "ring-line"}`}>Failed</a></nav>
      {/* one form for the table so the result stays visible after the Retry button disappears */}
      <ActionForm action={retryWebhookAction} className="card overflow-x-auto [&>[role]]:m-4">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Received</th><th className="px-3 py-3">Event</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Result</th><th className="px-5 py-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-2.5 text-ink-muted">{formatDateTime(r.receivedAt)}</td>
                <td className="px-3 py-2.5"><code className="text-xs">{r.type}</code></td>
                <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{r.ref ?? "—"}</td>
                <td className="px-3 py-2.5">{r.processedAt ? <span className="text-good-700">Processed{r.attempts > 1 && ` after ${r.attempts} attempts`}</span> : r.error ? <span className="text-bad-700">Failed: {r.error}</span> : <span className="text-ink-muted">Received</span>}</td>
                <td className="px-5 py-2 text-right">{canRetry && !r.processedAt && <SubmitButton name="eventId" value={String(r.id)} variant="secondary" className="h-9">Retry</SubmitButton>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-ink-muted">{failedOnly ? "No failed events." : "No events received yet. Configure the webhook in the Razorpay dashboard (see docs/OPERATIONS.md)."}</td></tr>}
          </tbody>
        </table>
      </ActionForm>
    </div>
  );
}

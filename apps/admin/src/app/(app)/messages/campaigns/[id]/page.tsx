import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { renderTemplate } from "@zentro/commerce/messaging";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { campaignAction, testSendAction } from "@/lib/actions/messages";
import { describeAudience, listCampaigns } from "@/lib/campaigns";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("messages.read");
  const id = z.guid().safeParse((await params).id).data;
  const c = id ? (await listCampaigns()).find((x) => x.id === id) : undefined;
  if (!c) notFound();
  const [attr] = await db()<{ orders: number; revenue: number }[]>`
    select count(distinct o.id)::int as orders, coalesce(sum(o.total_paise), 0)::int as revenue
    from shop.notification_outbox m join shop.orders o
      on (case when m.channel = 'email' then lower(o.email) else o.phone end) = m.recipient
     and o.placed_at between m.sent_at and m.sent_at + interval '7 days' and o.payment_status = 'paid'
    where m.campaign_id = ${c.id} and m.status in ('sent','delivered','read')`;
  const preview = renderTemplate(c.templateBody, { name: "Priya", store: "Zentro", coupon_code: c.couponCode ?? "", shop_link: "https://yourstore.in", unsubscribe_link: "https://yourstore.in/unsubscribe?…" });
  const canEdit = s.permissions.has("messages.campaigns");
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/campaigns" title={c.name}><Link href="/messages/campaigns" className="text-sm font-semibold text-brand-700">← Campaigns</Link></MessagesNav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <section className="card grid gap-4 p-5 sm:grid-cols-3" aria-label="Campaign summary">
            <div><p className="text-sm text-ink-muted">Status</p><p className="mt-1 text-lg font-bold capitalize">{c.status.replace(/_/g, " ")}</p></div>
            <div><p className="text-sm text-ink-muted">Eligible recipients</p><p className="mt-1 text-lg font-bold">{c.eligibleCount ?? 0}</p></div>
            <div><p className="text-sm text-ink-muted">Estimated cost</p><p className="mt-1 text-lg font-bold">{formatPaise(c.estimatedCostPaise ?? 0)}</p></div>
            <div><p className="text-sm text-ink-muted">Channel</p><p className="mt-1">{CHANNEL_LABEL[c.channel]}</p></div>
            <div><p className="text-sm text-ink-muted">Audience</p><p className="mt-1">{describeAudience(c.audience)}</p></div>
            <div><p className="text-sm text-ink-muted">Send at</p><p className="mt-1">{c.scheduledFor ? formatDateTime(c.scheduledFor) : "When approved"}</p></div>
          </section>
          <section className="card p-5" aria-labelledby="res-h">
            <h2 id="res-h" className="font-semibold">Results</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[["Waiting", c.queued], ["Accepted by provider", c.sent], ["Delivered (reported)", c.delivered], ["Failed", c.failed], ["Not sent (consent/limits/config)", c.suppressed], ["Actual + est. cost", formatPaise(c.cost)], ["Orders within 7 days", attr?.orders ?? 0], ["Revenue from those orders", formatPaise(attr?.revenue ?? 0)]].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl bg-canvas p-3"><dt className="text-xs text-ink-muted">{k}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-muted">Attribution counts paid orders by recipients within 7 days of their message — a guide, not proof of causation.</p>
          </section>
          <section className="card p-5 text-sm text-ink-muted">
            Created by {c.createdByEmail ?? "—"} · {formatDateTime(c.createdAt)}{c.approvedByEmail && <> · Approved by {c.approvedByEmail} {formatDateTime(c.approvedAt)}</>}{c.startedAt && <> · Started {formatDateTime(c.startedAt)}</>}{c.completedAt && <> · Completed {formatDateTime(c.completedAt)}</>}
          </section>
        </div>
        <aside className="space-y-4">
          <section className="card p-5">
            <h2 className="font-semibold">Preview · {c.templateName}</h2>
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-canvas p-4 text-sm">{preview}</p>
          </section>
          {(canEdit || s.permissions.has("messages.approve")) && (
            <ActionForm action={campaignAction} className="card space-y-3 p-5">
              <input type="hidden" name="campaignId" value={c.id} />
              {c.status === "draft" && <p className="text-sm text-ink-muted">The recipient count is re-checked against current consent when you submit, and again for each message at send time.</p>}
              {c.status === "pending_approval" && <p className="text-sm">This campaign reaches <strong>{c.eligibleCount}</strong> customers (≈ {formatPaise(c.estimatedCostPaise ?? 0)}) and needs approval.</p>}
              <div className="flex flex-wrap gap-2">
                {canEdit && c.status === "draft" && <SubmitButton name="op" value="submit" confirm={`Send to ${c.eligibleCount ?? 0} customers for about ${formatPaise(c.estimatedCostPaise ?? 0)}?`}>Submit for sending</SubmitButton>}
                {c.status === "pending_approval" && s.permissions.has("messages.approve") && <SubmitButton name="op" value="approve" confirm="Approve and schedule this campaign?">Approve</SubmitButton>}
                {canEdit && ["draft", "pending_approval", "scheduled", "sending"].includes(c.status) && <SubmitButton name="op" value="cancel" variant="danger" confirm="Cancel this campaign? Unsent messages will be stopped.">Cancel campaign</SubmitButton>}
              </div>
            </ActionForm>
          )}
          {canEdit && ["draft", "pending_approval", "scheduled", "sending"].includes(c.status) && (
            <>
              <ActionForm action={testSendAction} className="card space-y-2 p-5">
                <input type="hidden" name="templateId" value={c.templateId} /><input type="hidden" name="couponCode" value={c.couponCode ?? ""} />
                <label className="block text-sm font-medium">Send a test to<input name="to" required className="input mt-1.5 h-10" placeholder={c.channel === "email" ? "you@example.com" : "Your mobile"} /></label>
                <SubmitButton variant="secondary">Send test</SubmitButton>
              </ActionForm>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

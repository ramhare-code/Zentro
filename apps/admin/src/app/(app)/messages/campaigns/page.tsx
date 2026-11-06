import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { createCampaignAction } from "@/lib/actions/messages";
import { describeAudience, listCampaigns } from "@/lib/campaigns";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { listTemplates } from "@/lib/messages-data";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const s = await requirePermission("messages.read");
  const [campaigns, templates, categories, coupons] = await Promise.all([
    listCampaigns(), listTemplates({ category: ["promotional"] }),
    db()<{ slug: string; name: string }[]>`select slug, name from shop.categories where is_active order by name`,
    db()<{ code: string }[]>`select code from shop.coupons where is_active and (ends_at is null or ends_at > now()) order by code`,
  ]);
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/campaigns" title="Campaigns" />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[50rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Campaign</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Audience</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Sent / eligible</th><th className="px-5 py-3 text-right">Cost</th></tr></thead>
          <tbody className="divide-y divide-line">
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3"><Link href={`/messages/campaigns/${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.name}</Link><span className="block text-xs text-ink-muted">{formatDateTime(c.createdAt)}</span></td>
                <td className="px-3 py-3">{CHANNEL_LABEL[c.channel]}</td><td className="px-3 py-3 text-ink-muted">{describeAudience(c.audience)}</td>
                <td className="px-3 py-3 capitalize">{c.status.replace(/_/g, " ")}</td>
                <td className="px-3 py-3 text-right tabular-nums">{c.sent} / {c.eligibleCount ?? "—"}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatPaise(c.cost || c.estimatedCostPaise || 0)}</td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-ink-muted">No campaigns yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {s.permissions.has("messages.campaigns") && (
        <section className="card p-5" aria-labelledby="new-c">
          <h2 id="new-c" className="font-semibold">New promotional campaign</h2>
          <p className="mt-1 text-sm text-ink-muted">Only customers who opted in to the chosen channel are included. You’ll see the exact recipient count and cost before anything is sent.</p>
          {templates.length === 0 ? <p className="mt-4 text-sm text-warn-700">Create a promotional template first (Templates tab).</p> : (
            <ActionForm action={createCampaignAction} className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm font-medium">Name<input name="name" required maxLength={120} placeholder="Festive sale – SMS" className="input mt-1.5 h-10" /></label>
                <label className="text-sm font-medium">Channel<select name="channel" className="input mt-1.5 h-10"><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
                <label className="text-sm font-medium">Template (must match channel)<select name="templateId" className="input mt-1.5 h-10">{templates.map((t) => <option key={t.id} value={t.id}>{CHANNEL_LABEL[t.channel]} · {t.name}</option>)}</select></label>
              </div>
              <fieldset className="grid gap-3 rounded-xl bg-canvas p-4 md:grid-cols-4">
                <legend className="sr-only">Audience</legend>
                <label className="text-sm font-medium md:col-span-2">Audience
                  <select name="segment" className="input mt-1.5 h-10">
                    <option value="all_consented">Everyone who opted in</option>
                    <option value="purchased_within_days">Bought within the last N days</option>
                    <option value="not_purchased_within_days">Haven’t bought in N days (win-back)</option>
                    <option value="min_total_spent">Spent at least ₹X in total</option>
                    <option value="bought_category">Bought from a category</option>
                  </select>
                </label>
                <label className="text-sm font-medium">N days<input name="days" type="number" min={1} max={3650} defaultValue={90} className="input mt-1.5 h-10" /></label>
                <label className="text-sm font-medium">₹X<input name="minSpent" type="number" min={0} defaultValue={0} className="input mt-1.5 h-10" /></label>
                <label className="text-sm font-medium md:col-span-2">Category<select name="categorySlug" className="input mt-1.5 h-10"><option value="">—</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
              </fieldset>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium">Coupon to include <span className="font-normal text-ink-muted">(fills {"{{coupon_code}}"})</span><select name="couponCode" className="input mt-1.5 h-10"><option value="">None</option>{coupons.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
                <label className="text-sm font-medium">Send at (IST) <span className="font-normal text-ink-muted">(blank = as soon as approved)</span><input name="scheduledFor" type="datetime-local" className="input mt-1.5 h-10" /></label>
              </div>
              <SubmitButton>Create draft & preview</SubmitButton>
            </ActionForm>
          )}
        </section>
      )}
    </div>
  );
}

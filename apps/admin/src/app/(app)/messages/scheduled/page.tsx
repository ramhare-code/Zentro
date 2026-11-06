import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { describeAudience, listCampaigns } from "@/lib/campaigns";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Scheduled campaigns" };

export default async function ScheduledPage() {
  await requirePermission("messages.read");
  const rows = await listCampaigns(["pending_approval", "scheduled", "sending"]);
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/scheduled" title="Scheduled & in progress" />
      <p className="text-sm text-ink-muted">Promotions are only delivered within the permitted daily window (see Settings); messages due outside it wait until the window opens.</p>
      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/messages/campaigns/${c.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:ring-brand-200">
              <span><span className="font-semibold">{c.name}</span><span className="block text-sm text-ink-muted">{CHANNEL_LABEL[c.channel]} · {describeAudience(c.audience)} · {c.eligibleCount} recipients · ≈{formatPaise(c.estimatedCostPaise ?? 0)}</span></span>
              <span className="text-right text-sm"><span className="font-semibold capitalize">{c.status.replace(/_/g, " ")}</span><span className="block text-ink-muted">{c.scheduledFor ? formatDateTime(c.scheduledFor) : "As soon as approved"}</span></span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="card p-8 text-center text-ink-muted">Nothing scheduled.</li>}
      </ul>
    </div>
  );
}

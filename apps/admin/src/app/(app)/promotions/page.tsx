import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { MarketingNav, scheduleState, StateBadge } from "@/components/marketing/MarketingNav";
import { formatDateTime } from "@/lib/format";
import { listPromotions } from "@/lib/marketing";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  await requirePermission("marketing.manage");
  const rows = await listPromotions();
  return (
    <div className="space-y-5">
      <MarketingNav active="/promotions" title="Promotions"><Link href="/promotions/new" className="btn btn-primary">New promotion</Link></MarketingNav>
      <p className="max-w-3xl text-sm text-ink-muted">Automatic sale prices for a set period — no code needed. Prices return to normal by themselves when the promotion ends.</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Promotion</th><th className="px-3 py-3">Discount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Runs</th><th className="px-3 py-3 text-right">Units sold</th><th className="px-5 py-3 text-right">Sales</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-2.5"><Link href={`/promotions/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link><span className="block text-xs text-ink-muted">Badge: {p.badge} · {p.appliesTo}</span></td>
                <td className="px-3 py-2.5">{p.discountType === "percent" ? `${p.discountValue}%` : formatPaise(p.discountValue)} off</td>
                <td className="px-3 py-2.5"><StateBadge state={scheduleState(p)} /></td>
                <td className="px-3 py-2.5 text-xs text-ink-muted">{formatDateTime(p.startsAt)} →<br />{formatDateTime(p.endsAt)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.unitsSold}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{formatPaise(p.revenuePaise)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">No promotions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

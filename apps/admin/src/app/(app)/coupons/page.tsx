import Link from "next/link";
import { formatPaise } from "@zentro/commerce";
import { MarketingNav, scheduleState, StateBadge } from "@/components/marketing/MarketingNav";
import { formatDateTime } from "@/lib/format";
import { listCoupons } from "@/lib/marketing";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Coupons" };

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requirePermission("marketing.manage");
  const archived = (await searchParams).archived === "1";
  const rows = await listCoupons(archived);
  return (
    <div className="space-y-5">
      <MarketingNav active="/coupons" title="Coupons"><Link href="/coupons/new" className="btn btn-primary">New coupon</Link></MarketingNav>
      <nav className="flex gap-2 text-sm"><Link href="/coupons" aria-current={!archived ? "page" : undefined} className={`rounded-full px-3 py-1 ring-1 ${!archived ? "bg-ink text-white ring-ink" : "ring-line"}`}>Current</Link><Link href="/coupons?archived=1" aria-current={archived ? "page" : undefined} className={`rounded-full px-3 py-1 ring-1 ${archived ? "bg-ink text-white ring-ink" : "ring-line"}`}>Archived</Link></nav>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Code</th><th className="px-3 py-3">Offer</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Used</th><th className="px-3 py-3 text-right">Discount given</th><th className="px-3 py-3 text-right">Order value</th><th className="px-5 py-3">Ends</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-2.5"><Link href={`/coupons/${c.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{c.code}</Link>{c.isPublic && <span className="ml-1 text-xs text-ink-muted">· listed</span>}</td>
                <td className="px-3 py-2.5">{c.discountType === "percent" ? `${c.discountValue}%` : formatPaise(c.discountValue)} off{c.minOrderPaise > 0 && ` over ${formatPaise(c.minOrderPaise)}`}{c.appliesTo !== "all" && <span className="text-ink-muted"> · {c.appliesTo}</span>}<span className="block text-xs text-ink-muted">{c.description}</span></td>
                <td className="px-3 py-2.5"><StateBadge state={scheduleState(c)} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.usedCount}{c.usageLimit !== null && ` / ${c.usageLimit}`}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(c.discountGivenPaise)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatPaise(c.revenuePaise)}</td>
                <td className="px-5 py-2.5 text-ink-muted">{c.endsAt ? formatDateTime(c.endsAt) : "No end"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-ink-muted">{archived ? "Nothing archived." : "No coupons yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-subtle">“Used” counts paid orders; a cancelled order gives its use back. Unpaid checkouts briefly hold a use so limited coupons can’t be over-redeemed.</p>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { MarketingNav, scheduleState, StateBadge } from "@/components/marketing/MarketingNav";
import { PromotionFields } from "@/components/marketing/PromotionFields";
import { endPromotionAction, savePromotionAction } from "@/lib/actions/marketing";
import { catalogOptions } from "@/lib/catalog-admin";
import { getPromotion, promotionPreview, slugsFor } from "@/lib/marketing";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Promotion" };

export default async function PromotionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePermission("marketing.manage");
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const [p, { categories, brands }, preview] = await Promise.all([getPromotion(id), catalogOptions(), promotionPreview(id)]);
  if (!p) notFound();
  const state = scheduleState(p);
  const created = (await searchParams).created === "1";
  return (
    <div className="space-y-5">
      <MarketingNav active="/promotions" title={p.name}><StateBadge state={state} /></MarketingNav>
      {created && <p role="status" className="rounded-xl bg-good-50 px-4 py-3 text-sm text-good-700">Promotion created. {state === "live" ? "It’s live now." : state === "scheduled" ? "It starts automatically at the scheduled time." : ""}</p>}
      <section aria-label="Promotion results" className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-ink-muted">Units sold on promotion</p><p className="mt-1 text-2xl font-bold tabular-nums">{p.unitsSold}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-muted">Sales</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatPaise(p.revenuePaise)}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-muted">Discount given</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatPaise(p.discountGivenPaise)}</p></div>
      </section>
      <section aria-labelledby="covered" className="card overflow-x-auto">
        <h2 id="covered" className="px-5 pt-5 font-semibold">Items covered{preview.length === 50 && " (first 50)"}</h2>
        <table className="mt-3 w-full min-w-[44rem] text-sm">
          <thead className="border-y border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Item</th><th className="px-3 py-3 text-right">Normal price</th><th className="px-3 py-3 text-right">With this promotion</th><th className="px-3 py-3 text-right">Cost</th><th className="px-5 py-3">Now charging</th></tr></thead>
          <tbody className="divide-y divide-line">
            {preview.map((v) => (
              <tr key={v.sku}>
                <td className="px-5 py-2"><Link href={`/products/${v.productId}`} className="text-brand-700 hover:underline">{v.product}</Link><span className="block font-mono text-xs text-ink-muted">{v.sku}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPaise(v.base)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPaise(v.sale)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${v.cost !== null && v.sale < v.cost ? "font-semibold text-bad-700" : "text-ink-muted"}`}>{v.cost !== null ? formatPaise(v.cost) : "—"}{v.cost !== null && v.sale < v.cost && " · below cost"}</td>
                <td className="px-5 py-2 text-ink-muted">{formatPaise(v.current)}{state === "live" && !v.winning && v.current < v.base && " (another promotion is lower)"}</td>
              </tr>
            ))}
            {preview.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-ink-muted">No active items match.</td></tr>}
          </tbody>
        </table>
      </section>
      {state !== "ended" && <ActionForm action={savePromotionAction} className="card max-w-3xl space-y-4 p-5"><PromotionFields p={p} categories={categories} brands={brands.filter((b) => b.isActive)} productSlugs={await slugsFor(p.productIds)} /><SubmitButton>Save changes</SubmitButton></ActionForm>}
      <ActionForm action={endPromotionAction} className={state === "live" || state === "scheduled" ? "card flex max-w-3xl flex-wrap items-center gap-3 p-4 text-sm" : ""}>
        <input type="hidden" name="promotionId" value={p.id} />
        {(state === "live" || state === "scheduled") && <><p className="flex-1 text-ink-muted">End it now — prices go back to normal immediately.</p><SubmitButton variant="danger" confirm="End this promotion now?">End promotion</SubmitButton></>}
      </ActionForm>
    </div>
  );
}

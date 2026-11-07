import { istLocal } from "@/lib/ist";
import type { PromotionRow } from "@/lib/marketing";
import { ScopeFields } from "./MarketingNav";

export function PromotionFields({ p, categories, brands, productSlugs }: { p?: PromotionRow; categories: { id: string; label: string }[]; brands: { id: string; name: string }[]; productSlugs?: string }) {
  return (
    <div className="space-y-4">
      {p && <input type="hidden" name="promotionId" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Name (internal)<input name="name" defaultValue={p?.name} required maxLength={80} placeholder="Diwali 2026 — electronics" className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Badge customers see<input name="badge" defaultValue={p?.badge} required maxLength={24} placeholder="Diwali Sale" className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Discount type<select name="discountType" defaultValue={p?.discountType ?? "percent"} className="input mt-1.5"><option value="percent">Percentage off each item</option><option value="fixed">Flat ₹ off each item</option></select></label>
        <label className="text-sm font-medium">Discount (% or ₹)<input name="discountValue" inputMode="decimal" required defaultValue={p ? (p.discountType === "percent" ? p.discountValue : p.discountValue / 100) : ""} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Starts (IST)<input name="startsAt" type="datetime-local" required defaultValue={istLocal(p?.startsAt)} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Ends (IST)<input name="endsAt" type="datetime-local" required defaultValue={istLocal(p?.endsAt)} className="input mt-1.5" /></label>
      </div>
      <ScopeFields kinds={["all", "categories", "brands", "products"]} value={p?.appliesTo ?? "categories"} categories={categories} brands={brands} categoryIds={p?.categoryIds} brandIds={p?.brandIds} productSlugs={productSlugs} />
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={p?.isActive ?? true} className="size-4" /> Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="allowBelowCost" className="size-4" /> Allow selling below cost price (only if you mean to)</label>
      </div>
      <p className="text-xs text-ink-muted">The sale price is shown everywhere — listings, product page, cart and checkout — with the badge. If several promotions cover an item, the customer gets the lowest price. Coupons apply on top unless a coupon says otherwise.</p>
    </div>
  );
}

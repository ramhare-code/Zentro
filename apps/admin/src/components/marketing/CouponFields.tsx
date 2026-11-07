import { istLocal } from "@/lib/ist";
import type { CouponRow } from "@/lib/marketing";
import { ScopeFields } from "./MarketingNav";

const rs = (p: number | null | undefined) => (p === null || p === undefined ? "" : String(p / 100));

export function CouponFields({ c, categories, productSlugs }: { c?: CouponRow; categories: { id: string; label: string }[]; productSlugs?: string }) {
  const locked = !!c && c.usedCount > 0;
  return (
    <div className="space-y-4">
      {c && <input type="hidden" name="couponId" value={c.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Code<input name="code" defaultValue={c?.code} required={!locked} disabled={locked} maxLength={20} placeholder="DIWALI10" className="input mt-1.5 font-mono uppercase" />{locked && <span className="text-xs font-normal text-ink-muted">Can’t change after it has been used.</span>}</label>
        <label className="text-sm font-medium">Shown to customers<input name="description" defaultValue={c?.description} required maxLength={160} placeholder="10% off orders over ₹999" className="input mt-1.5" /></label>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">Discount</legend>
        <label className="text-sm font-medium">Discount type<select name="discountType" defaultValue={c?.discountType ?? "percent"} className="input mt-1.5"><option value="percent">Percentage off</option><option value="fixed">Flat ₹ off</option></select></label>
        <label className="text-sm font-medium">Discount (% or ₹)<input name="discountValue" inputMode="decimal" required defaultValue={c ? (c.discountType === "percent" ? c.discountValue : c.discountValue / 100) : ""} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Max discount ₹ <span className="font-normal text-ink-muted">(percentage only)</span><input name="maxDiscount" inputMode="decimal" defaultValue={rs(c?.maxDiscountPaise)} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Minimum order ₹<input name="minOrder" inputMode="decimal" defaultValue={c && c.minOrderPaise ? rs(c.minOrderPaise) : ""} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Total uses <span className="font-normal text-ink-muted">(blank = no limit)</span><input name="usageLimit" inputMode="numeric" defaultValue={c?.usageLimit ?? ""} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Uses per customer<input name="perUserLimit" inputMode="numeric" defaultValue={c ? c.perUserLimit ?? "" : 1} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Starts (IST, optional)<input name="startsAt" type="datetime-local" defaultValue={istLocal(c?.startsAt)} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Ends (IST, optional)<input name="endsAt" type="datetime-local" defaultValue={istLocal(c?.endsAt)} className="input mt-1.5" /></label>
      </fieldset>
      <ScopeFields kinds={["all", "categories", "products"]} value={c?.appliesTo ?? "all"} categories={categories} categoryIds={c?.categoryIds} productSlugs={productSlugs} />
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2"><input type="checkbox" name="firstOrderOnly" defaultChecked={c?.firstOrderOnly} className="size-4" /> First order only</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="combinable" defaultChecked={c?.combinable ?? true} className="size-4" /> Also applies to items already on sale</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isPublic" defaultChecked={c?.isPublic} className="size-4" /> Show as an offer at checkout</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} className="size-4" /> Active</label>
      </div>
    </div>
  );
}

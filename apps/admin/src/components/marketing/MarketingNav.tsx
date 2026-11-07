import Link from "next/link";
import clsx from "clsx";

const TABS = [["/coupons", "Coupons"], ["/promotions", "Promotions"], ["/banners", "Banners"]] as const;

export function MarketingNav({ active, title, children }: { active: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{children}</div>
      <nav aria-label="Marketing" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", active === href ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-white")}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

export type ScheduleState = "live" | "scheduled" | "ended" | "off" | "archived";
export function scheduleState(r: { isActive: boolean; startsAt: Date | null; endsAt: Date | null; archivedAt?: Date | null }, now = new Date()): ScheduleState {
  if (r.archivedAt) return "archived";
  if (r.endsAt && r.endsAt <= now) return "ended";
  if (!r.isActive) return "off";
  if (r.startsAt && r.startsAt > now) return "scheduled";
  return "live";
}
const tone: Record<ScheduleState, string> = { live: "bg-good-50 text-good-700", scheduled: "bg-info-50 text-info-700", ended: "bg-canvas text-ink-muted", off: "bg-warn-50 text-warn-700", archived: "bg-canvas text-ink-subtle" };
const label: Record<ScheduleState, string> = { live: "Live", scheduled: "Scheduled", ended: "Ended", off: "Switched off", archived: "Archived" };
export function StateBadge({ state }: { state: ScheduleState }) {
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone[state])}>{label[state]}</span>;
}

/** Shared scope picker (all / categories / brands / products). */
export function ScopeFields({ kinds, value, categories, brands, categoryIds = [], brandIds = [], productSlugs = "" }: {
  kinds: ("all" | "categories" | "brands" | "products")[]; value: string;
  categories: { id: string; label: string }[]; brands?: { id: string; name: string }[];
  categoryIds?: string[]; brandIds?: string[]; productSlugs?: string;
}) {
  const names = { all: "Everything", categories: "Categories (incl. subcategories)", brands: "Brands", products: "Specific products" };
  return (
    <fieldset className="space-y-3 rounded-xl ring-1 ring-line p-4">
      <legend className="px-1 text-sm font-semibold">Applies to</legend>
      <div className="flex flex-wrap gap-4 text-sm">{kinds.map((k) => <label key={k} className="flex items-center gap-2"><input type="radio" name="appliesTo" value={k} defaultChecked={value === k} className="size-4" />{names[k]}</label>)}</div>
      {kinds.includes("categories") && <label className="block text-sm font-medium">Categories<select name="categoryIds" multiple defaultValue={categoryIds} className="input mt-1.5 h-32 py-1">{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select><span className="text-xs font-normal text-ink-muted">Ctrl/⌘-click to choose several. Used when “Categories” is selected.</span></label>}
      {kinds.includes("brands") && brands && <label className="block text-sm font-medium">Brands<select name="brandIds" multiple defaultValue={brandIds} className="input mt-1.5 h-28 py-1">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
      {kinds.includes("products") && <label className="block text-sm font-medium">Product slugs<textarea name="productSlugs" rows={3} defaultValue={productSlugs} placeholder="one per line, e.g. modern-insulated-bottle" className="input mt-1.5 h-auto py-2 font-mono text-sm" /><span className="text-xs font-normal text-ink-muted">The slug is the last part of the product’s storefront link (/p/…).</span></label>}
    </fieldset>
  );
}

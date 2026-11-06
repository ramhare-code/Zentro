"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { CloseIcon, FilterIcon, StarIcon } from "../icons";
import { SORT_LABELS, SORTS, type ListingFilters, type Sort } from "@/lib/listing-params";

interface Props {
  children: React.ReactNode;
  filters: ListingFilters;
  brands: { slug: string; name: string; count: number }[];
  priceMin: number | null; // rupees
  priceMax: number | null;
  total: number;
}

const PRICE_PRESETS: [number | undefined, number | undefined, string][] = [
  [undefined, 999, "Under ₹999"],
  [1000, 2499, "₹1,000 – ₹2,499"],
  [2500, 4999, "₹2,500 – ₹4,999"],
  [5000, undefined, "₹5,000 & above"],
];

export function FiltersPanel({ children, filters, brands, priceMin, priceMax, total }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(filters.minPrice?.toString() ?? "");
  const [max, setMax] = useState(filters.maxPrice?.toString() ?? "");

  function navigate(next: Partial<ListingFilters>) {
    const m = { ...filters, ...next, page: 1 };
    const p = new URLSearchParams();
    if (m.q) p.set("q", m.q);
    if (m.brands.length) p.set("brand", m.brands.join(","));
    if (m.minPrice !== undefined) p.set("min", String(m.minPrice));
    if (m.maxPrice !== undefined) p.set("max", String(m.maxPrice));
    if (m.minRating) p.set("rating", String(m.minRating));
    if (m.inStock) p.set("instock", "1");
    if (m.sort !== (m.q ? "relevance" : "popularity")) p.set("sort", m.sort);
    const qs = p.toString();
    start(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
  }

  const toggleBrand = (slug: string) =>
    navigate({ brands: filters.brands.includes(slug) ? filters.brands.filter((b) => b !== slug) : [...filters.brands, slug] });

  const applyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const toNum = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Math.max(0, Math.floor(Number(v))));
    navigate({ minPrice: toNum(min), maxPrice: toNum(max) });
  };

  const activeCount =
    filters.brands.length + (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) + (filters.minRating ? 1 : 0) + (filters.inStock ? 1 : 0);

  const sortOptions = SORTS.filter((s) => s !== "relevance" || filters.q);

  const panel = (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-3 text-sm font-bold uppercase tracking-wide">Availability</legend>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={filters.inStock} onChange={(e) => navigate({ inStock: e.target.checked })} className="size-5 rounded accent-brand-600" />
          In stock only
        </label>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-bold uppercase tracking-wide">Price</legend>
        <ul className="space-y-2 text-sm">
          {PRICE_PRESETS.map(([lo, hi, label]) => {
            const checked = filters.minPrice === lo && filters.maxPrice === hi;
            return (
              <li key={label}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="price-preset"
                    checked={checked}
                    onChange={() => {
                      setMin(lo?.toString() ?? "");
                      setMax(hi?.toString() ?? "");
                      navigate({ minPrice: lo, maxPrice: hi });
                    }}
                    className="size-4 accent-brand-600"
                  />
                  {label}
                </label>
              </li>
            );
          })}
        </ul>
        <form onSubmit={applyPrice} className="mt-3 flex items-end gap-2">
          <label className="flex-1 text-xs text-ink-muted">
            Min ₹
            <input inputMode="numeric" pattern="[0-9]*" value={min} onChange={(e) => setMin(e.target.value)} placeholder={priceMin?.toString() ?? "0"} className="mt-1 h-10 w-full rounded-xl border border-line-strong px-3 text-sm text-ink" />
          </label>
          <label className="flex-1 text-xs text-ink-muted">
            Max ₹
            <input inputMode="numeric" pattern="[0-9]*" value={max} onChange={(e) => setMax(e.target.value)} placeholder={priceMax?.toString() ?? ""} className="mt-1 h-10 w-full rounded-xl border border-line-strong px-3 text-sm text-ink" />
          </label>
          <button type="submit" className="h-10 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">Go</button>
        </form>
      </fieldset>

      {brands.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-sm font-bold uppercase tracking-wide">Brand</legend>
          <ul className="space-y-2 text-sm">
            {brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={filters.brands.includes(b.slug)} onChange={() => toggleBrand(b.slug)} className="size-5 rounded accent-brand-600" />
                  <span className="flex-1">{b.name}</span>
                  <span className="text-ink-subtle">{b.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-3 text-sm font-bold uppercase tracking-wide">Customer rating</legend>
        <ul className="space-y-2 text-sm">
          {[4, 3, 2].map((r) => (
            <li key={r}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="radio" name="rating" checked={filters.minRating === r} onChange={() => navigate({ minRating: r })} className="size-4 accent-brand-600" />
                <span className="inline-flex items-center gap-1">{r}<StarIcon size={13} className="text-accent-500" /> & above</span>
              </label>
            </li>
          ))}
        </ul>
        {filters.minRating && (
          <button type="button" onClick={() => navigate({ minRating: undefined })} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">Clear rating</button>
        )}
      </fieldset>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
      <aside aria-label="Filters" className="hidden lg:block">
        <h2 className="mb-5 font-display text-lg font-bold">Filters</h2>
        {panel}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 bg-ink/40 lg:hidden" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Filters" className="absolute inset-y-0 right-0 w-[min(22rem,90vw)] overflow-y-auto bg-white p-5 shadow-pop">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Filters</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close filters" className="grid size-10 place-items-center rounded-full hover:bg-ink/5"><CloseIcon /></button>
            </div>
            {panel}
            <button type="button" onClick={() => setOpen(false)} className="mt-8 h-12 w-full rounded-full bg-brand-600 font-semibold text-white">
              Show {total.toLocaleString("en-IN")} results
            </button>
          </div>
        </div>
      )}

      <div className="min-w-0">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm text-ink-muted" aria-live="polite">
            {pending ? "Updating…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "product" : "products"}`}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-line lg:hidden">
              <FilterIcon size={18} /> Filters{activeCount ? ` (${activeCount})` : ""}
            </button>
            <label className="flex items-center gap-2 text-sm">
              <span className="hidden text-ink-muted sm:inline">Sort by</span>
              <select
                value={filters.sort}
                onChange={(e) => navigate({ sort: e.target.value as Sort })}
                className="h-10 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-line"
              >
                {sortOptions.map((s) => (
                  <option key={s} value={s}>{SORT_LABELS[s]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className={clsx("transition-opacity", pending && "opacity-60")}>{children}</div>
      </div>
    </div>
  );
}

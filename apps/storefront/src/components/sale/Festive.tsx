import Link from "next/link";
import clsx from "clsx";
import type { CurrentSale } from "@/lib/sale";
import { saleOffer } from "@/lib/sale";
import { Countdown } from "./Countdown";

/** A small lit diya (oil lamp), drawn in SVG. */
export function Diya({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false" className={clsx("festive-diya", className)}>
      <path className="festive-flame" d="M24 4c3 5 6 8 6 13a6 6 0 0 1-12 0c0-5 3-8 6-13z" fill="#ffcf5c" />
      <path d="M24 10c1.6 3 3 4.6 3 7.2a3 3 0 0 1-6 0c0-2.6 1.4-4.2 3-7.2z" fill="#ff8a1f" />
      <path d="M5 26h38c-1.5 9-9 15-19 15S6.5 35 5 26z" fill="#e8590c" />
      <path d="M9 26h30c-1 3-7 6-15 6S10 29 9 26z" fill="#ffb547" />
      <circle cx="16" cy="34" r="1.6" fill="#ffd8a8" /><circle cx="24" cy="36" r="1.6" fill="#ffd8a8" /><circle cx="32" cy="34" r="1.6" fill="#ffd8a8" />
    </svg>
  );
}

/** Slim festive bar above the header on every page while a sale runs. */
export function SaleStrip({ sale }: { sale: CurrentSale }) {
  return (
    <div className="festive-bg text-white">
      <Link href="/sale" className="container-page flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 py-1.5 text-center text-sm hover:underline">
        <Diya size={22} />
        <strong className="font-display font-extrabold tracking-tight">{sale.name}</strong>
        <span className="hidden text-white/90 sm:inline">· {saleOffer(sale)}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-semibold">
          Ends in <Countdown endsAt={sale.endsAt.toISOString()} />
        </span>
        <span className="font-semibold text-[#ffd8a8]">Shop now →</span>
      </Link>
    </div>
  );
}

/** Large festive banner for the home page and the sale page. */
export function SaleHero({ sale, cta = true, headingLevel = 2 }: { sale: CurrentSale; cta?: boolean; headingLevel?: 1 | 2 }) {
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <section aria-label={sale.name} className="festive-bg relative overflow-hidden rounded-card text-white shadow-pop">
      <div aria-hidden className="festive-sparkles absolute inset-0" />
      <div aria-hidden className="absolute -right-10 -top-10 size-64 rounded-full bg-[#ffb547]/25 blur-3xl" />
      <div className="relative grid items-center gap-6 p-6 sm:p-10 md:grid-cols-[1fr_auto]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-black/25 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#ffd8a8]"><Diya size={18} /> Festival of lights</p>
          <H className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{sale.name}</H>
          <p className="mt-2 text-lg font-semibold text-[#ffe8cc] sm:text-2xl">{saleOffer(sale)} across the store</p>
          <p className="mt-1 text-sm text-white/80">Prices already include the discount. Look for the “{sale.badge}” tag.</p>
          {cta && <Link href="/sale" className="mt-5 inline-flex h-12 items-center rounded-full bg-[#ffb547] px-7 font-bold text-ink shadow-card transition hover:bg-[#ffc56b]">Shop the sale</Link>}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/85">Hurry, sale ends in</p>
          <Countdown endsAt={sale.endsAt.toISOString()} size="lg" />
        </div>
      </div>
    </section>
  );
}

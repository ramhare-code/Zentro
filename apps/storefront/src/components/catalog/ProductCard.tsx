import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import type { ProductSummary } from "@/lib/catalog";
import { discountPercent } from "@zentro/commerce";
import { Price } from "./Price";
import { RatingBadge } from "./RatingBadge";
import { StockBadge } from "./StockBadge";

export function ProductCard({ product, priority = false, className }: { product: ProductSummary; priority?: boolean; className?: string }) {
  const off = discountPercent(product.mrpPaise, product.minPricePaise);
  const soldOut = product.totalStock <= 0;
  const href = `/p/${product.slug}`;
  return (
    <article
      className={clsx(
        "group relative flex flex-col overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-pop",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-brand-50">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt || product.name}
            fill
            sizes="(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw"
            priority={priority}
            className={clsx("object-cover transition duration-500 group-hover:scale-105", soldOut && "opacity-60 grayscale")}
          />
        ) : null}
        {off > 0 && !soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-accent-400 px-2.5 py-1 text-xs font-bold text-ink">{off}% off</span>
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 text-xs font-bold text-white">Sold out</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5 sm:p-4">
        {product.brandName && <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{product.brandName}</p>}
        <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-ink">
          {/* stretched link: whole card is clickable, one tab stop */}
          <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-card focus-visible:after:outline-3 focus-visible:after:outline-brand-500">
            {product.name}
          </Link>
        </h3>
        <RatingBadge avg={product.ratingAvg} count={product.ratingCount} />
        <div className="mt-auto pt-1">
          <Price pricePaise={product.minPricePaise} mrpPaise={product.mrpPaise} fromPrice={product.maxPricePaise > product.minPricePaise} />
          <StockBadge stock={product.totalStock} className="mt-1 text-xs" />
        </div>
      </div>
    </article>
  );
}

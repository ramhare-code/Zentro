import Link from "next/link";
import type { ProductSummary } from "@/lib/catalog";
import { ProductCard } from "./ProductCard";
import { ChevronRight } from "../icons";

export function ProductRail({
  id,
  title,
  subtitle,
  products,
  href,
}: {
  id: string;
  title: string;
  subtitle?: string;
  products: ProductSummary[];
  href?: string;
}) {
  if (!products.length) return null;
  return (
    <section aria-labelledby={id} className="container-page py-8 sm:py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            View all <ChevronRight size={16} />
          </Link>
        )}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-auto">
            <ProductCard product={p} className="h-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

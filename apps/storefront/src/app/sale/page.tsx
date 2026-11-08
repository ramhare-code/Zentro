import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { ProductCard } from "@/components/catalog/ProductCard";
import { SaleHero } from "@/components/sale/Festive";
import { getCategories, getSaleProducts } from "@/lib/catalog";
import { getCurrentSale, saleOffer } from "@/lib/sale";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const sale = await getCurrentSale();
  return sale
    ? { title: `${sale.name} — ${saleOffer(sale)}`, description: `${sale.name}: ${saleOffer(sale)}. Limited time.`, alternates: { canonical: "/sale" } }
    : { title: "Sale", alternates: { canonical: "/sale" } };
}

export default async function SalePage({ searchParams }: Props) {
  const raw = (await searchParams).category;
  const cat = typeof raw === "string" && /^[a-z0-9-]{1,80}$/.test(raw) ? raw : null;
  const [sale, products, categories, all] = await Promise.all([getCurrentSale(), getSaleProducts(cat), getCategories(), cat ? getSaleProducts() : Promise.resolve(null)]);
  const everything = all ?? products;
  const topCats = categories.filter((c) => !c.parentId && everything.some((p) => p.categorySlug === c.slug || categories.find((x) => x.slug === p.categorySlug)?.parentId === c.id));

  return (
    <div className="container-page py-6 sm:py-8">
      {sale ? <SaleHero sale={sale} cta={false} headingLevel={1} /> : (
        <div className="rounded-card bg-white p-8 text-center ring-1 ring-line">
          <h1 className="font-display text-2xl font-bold">No sale running right now</h1>
          <p className="mt-2 text-ink-muted">Our next sale is coming soon. Meanwhile, see today’s <Link href="/search?sort=popularity" className="font-semibold text-brand-700 underline">best sellers</Link>.</p>
        </div>
      )}

      {everything.length > 0 && (
        <>
          <nav aria-label="Sale categories" className="mt-6">
            <ul className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {[{ slug: null, name: "All deals" }, ...topCats.map((c) => ({ slug: c.slug, name: c.name }))].map((c) => (
                <li key={c.slug ?? "all"} className="shrink-0">
                  <Link href={c.slug ? `/sale?category=${c.slug}` : "/sale"} aria-current={cat === c.slug ? "page" : undefined}
                    className={clsx("inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold ring-1", cat === c.slug ? "bg-[#8a1c3d] text-white ring-[#8a1c3d]" : "bg-white text-ink ring-line-strong hover:bg-canvas")}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <h2 className="mt-6 font-display text-xl font-bold sm:text-2xl">{products.length} {products.length === 1 ? "deal" : "deals"}{cat ? ` in ${categories.find((c) => c.slug === cat)?.name ?? "this category"}` : ""}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {products.map((p, i) => <li key={p.id}><ProductCard product={p} priority={i < 4} className="h-full" /></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

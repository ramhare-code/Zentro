import { CategoryCard } from "@/components/catalog/CategoryCard";
import { ProductRail } from "@/components/catalog/ProductRail";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { HeadsetIcon, ReturnIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { getActiveBanners, getCategories, getHomeRails } from "@/lib/catalog";
import { SITE_NAME, siteUrl } from "@/lib/site";

// Catalogue pages are cached and re-generated at most every 5 minutes.
export const revalidate = 300;

const promises = [
  { icon: TruckIcon, title: "Fast delivery", text: "Delivery dates shown at checkout" },
  { icon: ShieldIcon, title: "Secure payments", text: "UPI, cards, net banking & wallets" },
  { icon: ReturnIcon, title: "Easy returns", text: "Request returns from your orders" },
  { icon: HeadsetIcon, title: "Real support", text: "Raise and track support tickets" },
];

export default async function HomePage() {
  const [banners, categories, rails] = await Promise.all([getActiveBanners(), getCategories(), getHomeRails()]);
  const topCategories = categories.filter((c) => !c.parentId);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: siteUrl("/"),
          potentialAction: { "@type": "SearchAction", target: `${siteUrl("/search")}?q={search_term_string}`, "query-input": "required name=search_term_string" },
        }}
      />
      <h1 className="sr-only">{SITE_NAME} — shop electronics, fashion, home and accessories</h1>

      <HeroCarousel banners={banners} />

      <section aria-label="Why shop with us" className="container-page pt-6">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {promises.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-line sm:p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={20} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-ink-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {topCategories.length > 0 && (
        <section aria-labelledby="shop-by-category" className="container-page py-8 sm:py-10">
          <h2 id="shop-by-category" className="mb-5 font-display text-2xl font-bold tracking-tight sm:text-3xl">Shop by category</h2>
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {topCategories.map((c) => (
              <li key={c.id}><CategoryCard category={c} /></li>
            ))}
          </ul>
        </section>
      )}

      <ProductRail id="deals" title="Top deals" subtitle="The biggest savings right now" products={rails.deals} />
      <ProductRail id="featured" title="Recommended for you" subtitle="Hand-picked favourites" products={rails.featured} />
      <ProductRail id="bestsellers" title="Best sellers" products={rails.bestsellers} href="/search?sort=popularity" />
      <ProductRail id="new" title="New arrivals" products={rails.newest} href="/search?sort=newest" />
    </>
  );
}

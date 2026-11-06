import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { WishlistItemActions } from "@/components/engage/WishlistItemActions";
import { Price } from "@/components/catalog/Price";
import { StockBadge } from "@/components/catalog/StockBadge";
import { ButtonLink } from "@/components/ui/Button";
import { getCustomer } from "@/lib/customer";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const c = await getCustomer();
  if (!c) {
    return (
      <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
        <div className="max-w-md">
          <h1 className="font-display text-3xl font-bold">Your wishlist</h1>
          <p className="mt-2 text-ink-muted">Sign in to save products and find them on any device.</p>
          <div className="mt-6 flex justify-center gap-3"><ButtonLink href="/account/login?next=/wishlist">Sign in</ButtonLink><ButtonLink href="/account/register?next=/wishlist" variant="secondary">Create account</ButtonLink></div>
        </div>
      </div>
    );
  }
  const items = await db()<{ id: string; slug: string; name: string; imageUrl: string | null; minPricePaise: number; mrpPaise: number; totalStock: number; variantCount: number; available: boolean }[]>`
    select p.id, p.slug, p.name, pl.image_url as "imageUrl", coalesce(pl.min_price_paise, 0) as "minPricePaise", coalesce(pl.mrp_paise, 0) as "mrpPaise",
           coalesce(pl.total_stock, 0) as "totalStock", coalesce(pl.variant_count, 0) as "variantCount", (pl.id is not null) as available
    from shop.wishlist_items w join shop.products p on p.id = w.product_id left join shop.product_listing pl on pl.id = p.id
    where w.user_id = ${c.id} order by w.created_at desc`;
  return (
    <div className="container-page max-w-4xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Wishlist</h1>
      {items.length === 0 ? <p className="mt-4 text-ink-muted">Nothing saved yet. Tap “Save to wishlist” on any product.</p> : (
        <ul className="mt-6 space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex gap-4 rounded-card bg-white p-4 ring-1 ring-line">
              <Link href={`/p/${i.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="96px" className="object-cover" />}</Link>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Link href={`/p/${i.slug}`} className="font-semibold hover:text-brand-700">{i.name}</Link>
                {i.available ? <><Price pricePaise={i.minPricePaise} mrpPaise={i.mrpPaise} /><StockBadge stock={i.totalStock} className="text-xs" /></> : <p className="text-sm text-danger-700">No longer available</p>}
                <WishlistItemActions productId={i.id} slug={i.slug} inStock={i.available && i.totalStock > 0} singleVariant={i.variantCount === 1} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

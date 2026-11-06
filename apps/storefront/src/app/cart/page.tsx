import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { discountPercent, formatPaise } from "@zentro/commerce";
import { CartLineControls } from "@/components/cart/CartLineControls";
import { StockBadge } from "@/components/catalog/StockBadge";
import { ButtonLink } from "@/components/ui/Button";
import { getCartId, getCartLines } from "@/lib/cart";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const lines = await getCartLines(await getCartId(false));
  const sellable = lines.filter((l) => l.available && l.stock > 0);
  const subtotal = sellable.reduce((a, l) => a + l.pricePaise * Math.min(l.quantity, l.stock), 0);
  const mrp = sellable.reduce((a, l) => a + l.mrpPaise * Math.min(l.quantity, l.stock), 0);
  const issues = lines.filter((l) => !l.available || l.stock < l.quantity);

  if (!lines.length) {
    return (
      <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
        <div>
          <h1 className="font-display text-3xl font-bold">Your cart is empty</h1>
          <p className="mt-2 text-ink-muted">Find something you’ll love.</p>
          <ButtonLink href="/" className="mt-6">Start shopping</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Your cart</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="space-y-3">
          {lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 rounded-card bg-white p-4 ring-1 ring-line">
              <Link href={`/p/${l.productSlug}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                {l.imageUrl && <Image src={l.imageUrl} alt="" fill sizes="96px" className="object-cover" />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/p/${l.productSlug}`} className="font-semibold hover:text-brand-700">{l.productName}</Link>
                {l.variantLabel && <p className="text-sm text-ink-muted">{l.variantLabel}</p>}
                <p className="mt-1 font-bold">{formatPaise(l.pricePaise)}
                  {discountPercent(l.mrpPaise, l.pricePaise) > 0 && <span className="ml-2 text-sm font-normal text-ink-subtle line-through">{formatPaise(l.mrpPaise)}</span>}
                </p>
                {!l.available ? <p className="mt-1 text-sm font-semibold text-danger-700">No longer available</p> : <StockBadge stock={l.stock} className="mt-1 text-xs" />}
                {l.available && l.stock > 0 && l.stock < l.quantity && <p className="text-sm text-warning-700">Only {l.stock} available — quantity will be reduced.</p>}
                <div className="mt-2"><CartLineControls variantId={l.variantId} quantity={l.quantity} max={l.available ? l.stock : 0} label={l.productName} /></div>
              </div>
            </li>
          ))}
        </ul>
        <aside className="h-fit rounded-card bg-white p-5 ring-1 ring-line lg:sticky lg:top-36">
          <h2 className="font-display text-lg font-bold">Price details</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Price (MRP)</dt><dd>{formatPaise(mrp)}</dd></div>
            {mrp > subtotal && <div className="flex justify-between text-success-700"><dt>Discount</dt><dd>−{formatPaise(mrp - subtotal)}</dd></div>}
            <div className="flex justify-between text-ink-muted"><dt>Delivery</dt><dd>Calculated at checkout</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Subtotal</dt><dd>{formatPaise(subtotal)}</dd></div>
          </dl>
          <p className="mt-1 text-xs text-ink-muted">Inclusive of all taxes</p>
          {issues.length > 0 && <p className="mt-3 rounded-xl bg-warning-50 p-3 text-sm text-warning-700">Some items changed since you added them. Please review before checking out.</p>}
          {sellable.length > 0 ? (
            <ButtonLink href="/checkout" variant="accent" className="mt-5 w-full">Proceed to checkout</ButtonLink>
          ) : (
            <p className="mt-5 text-sm text-danger-700">None of these items can be bought right now.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

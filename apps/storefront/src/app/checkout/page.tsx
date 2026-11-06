import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCartId, getCartLines, linesForVariant } from "@/lib/cart";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ buy?: string; qty?: string }> }) {
  const sp = await searchParams;
  const buyId = z.string().uuid().safeParse(sp.buy).data;
  const qty = z.coerce.number().int().min(1).max(10).safeParse(sp.qty).data ?? 1;
  const lines = buyId ? await linesForVariant(buyId, qty) : await getCartLines(await getCartId(false));
  if (!lines.some((l) => l.available && l.stock > 0)) redirect(buyId ? "/" : "/cart");
  return (
    <div className="container-page py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-ink-muted">{buyId ? "Buying now: " + lines[0]!.productName : `${lines.reduce((a, l) => a + l.quantity, 0)} item(s) from your cart`}</p>
      <div className="mt-6"><CheckoutForm buy={buyId ? { variantId: buyId, quantity: qty } : undefined} initialQuote={null} /></div>
    </div>
  );
}

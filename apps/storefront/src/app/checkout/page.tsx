import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCartId, getCartLines, linesForVariant } from "@/lib/cart";
import { getCustomer } from "@/lib/customer";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ buy?: string; qty?: string }> }) {
  const sp = await searchParams;
  const buyId = z.guid().safeParse(sp.buy).data;
  const qty = z.coerce.number().int().min(1).max(10).safeParse(sp.qty).data ?? 1;
  const lines = buyId ? await linesForVariant(buyId, qty) : await getCartLines(await getCartId(false));
  if (!lines.some((l) => l.available && l.stock > 0)) redirect(buyId ? "/" : "/cart");
  const customer = await getCustomer();
  const [addr] = customer
    ? await db()<{ fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; stateCode: string; pincode: string }[]>`
        select full_name as "fullName", phone, line1, line2, landmark, city, state_code as "stateCode", pincode
        from shop.addresses where user_id = ${customer.id} order by is_default desc, created_at limit 1`
    : [];
  const prefill = customer
    ? { email: customer.email, fullName: addr?.fullName ?? customer.fullName, phone: addr?.phone ?? customer.phone ?? "", line1: addr?.line1 ?? "", line2: addr?.line2 ?? "",
        landmark: addr?.landmark ?? "", city: addr?.city ?? "", stateCode: addr?.stateCode ?? "", pincode: addr?.pincode ?? "" }
    : undefined;
  return (
    <div className="container-page py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-ink-muted">{buyId ? "Buying now: " + lines[0]!.productName : `${lines.reduce((a, l) => a + l.quantity, 0)} item(s) from your cart`}</p>
      <div className="mt-6"><CheckoutForm buy={buyId ? { variantId: buyId, quantity: qty } : undefined} initialQuote={null} prefill={prefill} signedIn={!!customer} /></div>
    </div>
  );
}

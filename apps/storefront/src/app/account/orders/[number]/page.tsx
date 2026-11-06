import { notFound, redirect } from "next/navigation";
import { rotateGuestToken } from "@zentro/commerce/orders";
import { getCustomer } from "@/lib/customer";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Signed-in owners open their order without the emailed secret: a fresh one is issued. */
export default async function OwnOrder({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const c = await getCustomer();
  if (!c) redirect(`/account/login?next=/account/orders/${encodeURIComponent(number)}`);
  const [o] = await db()<{ id: string }[]>`select id from shop.orders where order_number = ${number} and user_id = ${c.id}`;
  if (!o) notFound();
  const token = await rotateGuestToken(db(), o.id);
  redirect(`/order/${number}?t=${encodeURIComponent(token)}`);
}

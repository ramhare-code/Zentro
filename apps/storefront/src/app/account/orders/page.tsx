import type { Metadata } from "next";
import Link from "next/link";
import { formatPaise, ORDER_STATUS_LABELS, type OrderStatus } from "@zentro/commerce";
import { LookupForm } from "@/components/order/LookupForm";
import { getCustomer } from "@/lib/customer";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };
export const dynamic = "force-dynamic";
const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function OrdersPage() {
  const c = await getCustomer();
  const orders = c
    ? await db()<{ orderNumber: string; status: OrderStatus; totalPaise: number; createdAt: Date; items: number; firstItem: string }[]>`
        select o.order_number as "orderNumber", o.status, o.total_paise as "totalPaise", o.created_at as "createdAt",
               (select sum(quantity)::int from shop.order_items i where i.order_id = o.id) as items,
               (select product_name from shop.order_items i where i.order_id = o.id order by product_name limit 1) as "firstItem"
        from shop.orders o where o.user_id = ${c.id} order by o.created_at desc limit 100`
    : [];
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">{c ? "My orders" : "Track your order"}</h1>
      {c ? (
        orders.length === 0 ? <p className="mt-4 text-ink-muted">No orders yet.{!c.emailVerified && " Verify your email to see orders you placed as a guest."}</p> : (
          <ul className="mt-6 space-y-3">
            {orders.map((o) => (
              <li key={o.orderNumber}>
                <Link href={`/account/orders/${o.orderNumber}`} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-4 ring-1 ring-line hover:ring-brand-200">
                  <span><span className="font-semibold">{o.orderNumber}</span><span className="block text-sm text-ink-muted">{o.firstItem}{o.items > 1 && ` + ${o.items - 1} more`} · {dt.format(o.createdAt)}</span></span>
                  <span className="text-right text-sm"><span className="block font-semibold">{formatPaise(o.totalPaise)}</span><span className="text-ink-muted">{ORDER_STATUS_LABELS[o.status]}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <p className="mb-6 mt-2 text-ink-muted">Enter the details you used at checkout, or <Link href="/account/login?next=/account/orders" className="font-semibold text-brand-700 underline">sign in</Link> to see all your orders.</p>
          <LookupForm />
        </>
      )}
    </div>
  );
}

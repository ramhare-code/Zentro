import Link from "next/link";
import { formatPaise, ORDER_STATUS_LABELS, type OrderStatus } from "@zentro/commerce";
import { db } from "@/lib/db";
import { maskEmail, maskPhone } from "@/lib/mask";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireStaff();
  const q = ((await searchParams).q ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const like = `%${q.toLowerCase().replace(/[%_\\]/g, "")}%`;
  const pii = s.permissions.has("customers.pii");
  const sql = db();

  const [orders, products, customers] = q.length < 2 ? [[], [], []] : await Promise.all([
    s.permissions.has("orders.read")
      ? sql<{ id: string; orderNumber: string; email: string; phone: string; status: OrderStatus; totalPaise: number }[]>`
          select id, order_number as "orderNumber", email, phone, status, total_paise as "totalPaise" from shop.orders
          where lower(order_number) like ${like} or lower(email) like ${like} or phone like ${like}
          order by created_at desc limit 10`
      : Promise.resolve([]),
    s.permissions.has("products.read")
      ? sql<{ id: string; name: string; slug: string; sku: string | null }[]>`
          select p.id, p.name, p.slug, (select string_agg(v.sku, ', ') from shop.product_variants v where v.product_id = p.id and lower(v.sku) like ${like}) as sku
          from shop.products p
          where lower(p.name) like ${like} or exists (select 1 from shop.product_variants v where v.product_id = p.id and lower(v.sku) like ${like})
          order by p.name limit 10`
      : Promise.resolve([]),
    s.permissions.has("customers.read")
      ? sql<{ id: string; email: string | null; name: string | null }[]>`
          select id, email, full_name as name from shop.customers
          where status <> 'deleted' and (email like ${like} or lower(full_name) like ${like} or phone like ${like}) limit 10`
      : Promise.resolve([]),
  ]);

  const none = !orders.length && !products.length && !customers.length;
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{q ? <>Results for “{q}”</> : "Search"}</h1>
      {q.length < 2 && <p className="text-ink-muted">Type at least 2 characters in the search bar.</p>}
      {q.length >= 2 && none && <p className="card p-6 text-ink-muted">Nothing found in the areas you can access.</p>}
      {orders.length > 0 && (
        <section className="card p-5"><h2 className="font-semibold">Orders</h2>
          <ul className="mt-3 divide-y divide-line">{orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <Link href={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link>
              <span className="text-ink-muted">{pii ? o.email : maskEmail(o.email)} · {pii ? o.phone : maskPhone(o.phone)}</span>
              <span>{ORDER_STATUS_LABELS[o.status]} · {formatPaise(o.totalPaise)}</span>
            </li>))}</ul>
        </section>
      )}
      {products.length > 0 && (
        <section className="card p-5"><h2 className="font-semibold">Products</h2>
          <ul className="mt-3 divide-y divide-line">{products.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-2.5 text-sm">
              <Link href={`/products?q=${encodeURIComponent(p.name)}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link>
              {p.sku && <span className="text-ink-muted">SKU {p.sku}</span>}
            </li>))}</ul>
        </section>
      )}
      {customers.length > 0 && (
        <section className="card p-5"><h2 className="font-semibold">Customers</h2>
          <ul className="mt-3 divide-y divide-line">{customers.map((c) => (
            <li key={c.id} className="flex justify-between gap-2 py-2.5 text-sm">
              <Link href={`/customers?q=${encodeURIComponent(c.email ?? "")}`} className="font-semibold text-brand-700 hover:underline">{c.name ?? "Customer"}</Link>
              <span className="text-ink-muted">{c.email ? (pii ? c.email : maskEmail(c.email)) : "—"}</span>
            </li>))}</ul>
        </section>
      )}
    </div>
  );
}

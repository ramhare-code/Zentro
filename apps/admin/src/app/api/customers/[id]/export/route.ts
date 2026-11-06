import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AuthorizationError, authorize } from "@/lib/session";

/** Data access / portability request: everything we hold about one customer, as JSON. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let s;
  try { s = await authorize("customers.pii", { recentAuth: true }); } catch (e) {
    return NextResponse.json({ error: e instanceof AuthorizationError && e.permission === "recent_auth" ? "Confirm it’s you first (2-step code)." : "Not permitted" }, { status: 403 });
  }
  if (!s.permissions.has("customers.manage")) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const id = z.guid().safeParse((await params).id).data;
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const sql = db();
  const [customer] = await sql`select id, email, email_verified_at, full_name, phone, phone_verified_at, status, created_at, last_login_at from shop.customers where id = ${id}`;
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const email = customer.email as string, phone = customer.phone as string | null;
  const data = {
    exportedAt: new Date().toISOString(), customer,
    addresses: await sql`select label, full_name, phone, line1, line2, landmark, city, state_code, pincode, is_default, created_at from shop.addresses where user_id = ${id}`,
    orders: await sql`select o.order_number, o.created_at, o.status, o.payment_status, o.total_paise, o.shipping_address,
                        (select json_agg(json_build_object('product', product_name, 'variant', variant_label, 'quantity', quantity, 'price_paise', unit_price_paise)) from shop.order_items where order_id = o.id) as items
                      from shop.orders o where o.user_id = ${id} or lower(o.email) = ${email} order by o.created_at`,
    reviews: await sql`select r.rating, r.title, r.body, r.status, r.created_at, p.name as product from shop.reviews r join shop.products p on p.id = r.product_id where r.user_id = ${id}`,
    wishlist: await sql`select p.name, w.created_at from shop.wishlist_items w join shop.products p on p.id = w.product_id where w.user_id = ${id}`,
    supportTickets: await sql`select t.ticket_number, t.subject, t.status, t.created_at,
                                (select json_agg(json_build_object('from', author, 'body', body, 'at', created_at) order by created_at) from shop.ticket_messages m where m.ticket_id = t.id and not m.internal) as messages
                              from shop.support_tickets t where t.user_id = ${id} or t.email = ${email}`,
    marketingConsent: await sql`select channel, status, source, wording, created_at from shop.marketing_consents where recipient = any(${[email, phone].filter(Boolean) as string[]}::text[]) order by id`,
    messagesSent: await sql`select channel, template, kind, status, created_at, sent_at from shop.notification_outbox where recipient = any(${[email, phone].filter(Boolean) as string[]}::text[]) order by id`,
  };
  await audit(s, { action: "customer.data_export", entityType: "customer", entityId: id });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="customer-${id}.json"`, "cache-control": "no-store" },
  });
}

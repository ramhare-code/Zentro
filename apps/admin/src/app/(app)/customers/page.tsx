import Link from "next/link";
import clsx from "clsx";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { maskEmail, maskPhone } from "@/lib/mask";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("customers.read");
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase().replace(/[%_\\]/g, "").slice(0, 100) || undefined;
  const status = z.enum(["active", "restricted"]).safeParse(sp.status).data;
  const sql = db();
  const rows = await sql<{ id: string; name: string; email: string; phone: string | null; status: string; createdAt: Date; orders: number; spent: number; verified: boolean }[]>`
    select c.id, c.full_name as name, c.email, c.phone, c.status, c.created_at as "createdAt", (c.email_verified_at is not null) as verified,
           (select count(*)::int from shop.orders o where o.user_id = c.id and o.payment_status <> 'pending') as orders,
           (select coalesce(sum(total_paise), 0)::int from shop.orders o where o.user_id = c.id and o.payment_status in ('paid','partially_refunded')) as spent
    from shop.customers c
    where c.status <> 'deleted'
      ${status ? sql`and c.status = ${status}` : sql``}
      ${q ? sql`and (c.email like ${"%" + q + "%"} or lower(c.full_name) like ${"%" + q + "%"} or c.phone like ${"%" + q + "%"})` : sql``}
    order by c.created_at desc limit 200`;
  const pii = s.permissions.has("customers.pii");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
      {sp.erased && <p role="status" className="rounded-xl bg-good-50 p-4 text-sm text-good-700">Personal data erased. Orders are kept anonymously for tax records, and the request is logged.</p>}
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-sm font-medium">Search<input name="q" defaultValue={q} placeholder="Name, email or mobile" className="input mt-1.5 h-10" /></label>
        <label className="text-sm font-medium">Status<select name="status" defaultValue={status ?? ""} className="input mt-1.5 h-10 w-40"><option value="">All</option><option value="active">Active</option><option value="restricted">Restricted</option></select></label>
        <button className="btn btn-primary h-10">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Customer</th><th className="px-3 py-3">Joined</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Spent</th><th className="px-5 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3"><Link href={`/customers/${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.name}</Link><span className="block text-xs text-ink-muted">{pii ? c.email : maskEmail(c.email)}{c.phone && ` · ${pii ? c.phone : maskPhone(c.phone)}`}{!c.verified && " · unverified"}</span></td>
                <td className="px-3 py-3 text-ink-muted">{formatDateTime(c.createdAt)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{c.orders}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatPaise(c.spent)}</td>
                <td className="px-5 py-3"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", c.status === "active" ? "bg-good-50 text-good-700" : "bg-bad-50 text-bad-700")}>{c.status}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-ink-muted">No customers found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

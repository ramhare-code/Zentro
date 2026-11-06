import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatPaise, ORDER_STATUS_LABELS, stateName, type OrderStatus } from "@zentro/commerce";
import { hasMarketingConsent } from "@zentro/commerce/messaging";
import { AddressForm, DeleteAccount, DeleteAddress, PhoneVerify, PreferenceToggle, ProfileForm, ResendVerification, SignOutEverywhere, type Address } from "@/components/account/AccountForms";
import { logoutAction } from "@/lib/actions/account";
import { getCustomer } from "@/lib/customer";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";
const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section aria-labelledby={id} className="rounded-card bg-white p-5 ring-1 ring-line sm:p-6"><h2 id={id} className="font-display text-lg font-bold">{title}</h2><div className="mt-4">{children}</div></section>;
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string; reset?: string }> }) {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  const sp = await searchParams;
  const sql = db();
  const [addresses, orders, prefs] = await Promise.all([
    sql<Address[]>`select id, label, full_name as "fullName", phone, line1, line2, landmark, city, state_code as "stateCode", pincode, is_default as "isDefault"
                   from shop.addresses where user_id = ${c.id} order by is_default desc, created_at`,
    sql<{ orderNumber: string; status: OrderStatus; totalPaise: number; createdAt: Date }[]>`
      select order_number as "orderNumber", status, total_paise as "totalPaise", created_at as "createdAt" from shop.orders
      where user_id = ${c.id} and status not in ('pending_payment') order by created_at desc limit 5`,
    Promise.all([
      hasMarketingConsent(sql, "email", c.email),
      c.phone ? hasMarketingConsent(sql, "sms", c.phone) : false,
      c.phone ? hasMarketingConsent(sql, "whatsapp", c.phone) : false,
    ]),
  ]);

  return (
    <div className="container-page max-w-4xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-3xl font-bold tracking-tight">Hi, {c.fullName.split(" ")[0]}</h1><p className="text-ink-muted">{c.email}</p></div>
        <form action={logoutAction}><button className="h-10 rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-line-strong hover:bg-canvas">Sign out</button></form>
      </div>
      {sp.welcome && <p role="status" className="rounded-xl bg-success-50 p-4 text-sm text-success-700">Welcome to Zentro! {c.emailVerified ? "" : `We’ve sent a verification link to ${c.email}.`}</p>}
      {sp.reset && <p role="status" className="rounded-xl bg-success-50 p-4 text-sm text-success-700">Your password has been changed.</p>}
      {!c.emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-50 p-4 text-sm text-warning-700">
          <span>Please verify your email to see past orders and manage email preferences.</span><ResendVerification />
        </div>
      )}

      <Section id="orders-h" title="Recent orders">
        {orders.length === 0 ? <p className="text-sm text-ink-muted">No orders yet.</p> : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.orderNumber} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <Link href={`/account/orders/${o.orderNumber}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link>
                <span className="text-ink-muted">{dt.format(o.createdAt)}</span><span>{ORDER_STATUS_LABELS[o.status]}</span><span className="font-semibold">{formatPaise(o.totalPaise)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/account/orders" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">All orders →</Link>
      </Section>

      <Section id="profile-h" title="Profile">
        <div className="space-y-5"><ProfileForm fullName={c.fullName} /><PhoneVerify phone={c.phone} verified={c.phoneVerified} /></div>
      </Section>

      <Section id="addr-h" title="Saved addresses">
        <ul className="space-y-4">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-xl bg-canvas p-4">
              <details>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                  <span className="text-sm"><span className="font-semibold">{a.label ?? a.fullName}</span>{a.isDefault && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">Default</span>}<br /><span className="text-ink-muted">{a.line1}, {a.city}, {stateName(a.stateCode)} {a.pincode}</span></span>
                  <span className="text-sm font-semibold text-brand-700">Edit</span>
                </summary>
                <div className="mt-4"><AddressForm a={a} /><div className="mt-2"><DeleteAddress id={a.id} /></div></div>
              </details>
            </li>
          ))}
        </ul>
        <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-brand-700">+ Add a new address</summary><div className="mt-4"><AddressForm /></div></details>
      </Section>

      <Section id="pref-h" title="Offers & messages">
        <p className="mb-4 text-sm text-ink-muted">Order and delivery updates are always sent. Choose which channels may send you offers and new arrivals — each one separately.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <PreferenceToggle channel="email" label="Email offers" on={prefs[0]} canEnable={c.emailVerified} hint={c.emailVerified ? undefined : "Verify your email first"} />
          <PreferenceToggle channel="sms" label="SMS offers" on={prefs[1]} canEnable={c.phoneVerified} hint={c.phoneVerified ? undefined : "Verify your mobile first"} />
          <PreferenceToggle channel="whatsapp" label="WhatsApp offers" on={prefs[2]} canEnable={c.phoneVerified} hint={c.phoneVerified ? undefined : "Verify your mobile first"} />
        </div>
      </Section>

      <Section id="sec-h" title="Security">
        <div className="flex flex-wrap gap-3"><SignOutEverywhere /><Link href="/account/forgot" className="inline-flex h-11 items-center rounded-full bg-white px-6 font-semibold ring-1 ring-inset ring-line-strong hover:bg-canvas">Change password</Link></div>
      </Section>

      <Section id="del-h" title="Delete account"><DeleteAccount /></Section>
    </div>
  );
}

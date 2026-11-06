"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatPaise, INDIAN_STATES } from "@zentro/commerce";
import type { Quote } from "@zentro/commerce/orders";
import { placeOrderAction, previewQuoteAction, type CheckoutInput, type PlaceResult } from "@/lib/actions/checkout";
import { track } from "@/lib/analytics-client";
import { useRazorpayPay } from "./PayButton";

type Buy = { variantId: string; quantity: number } | undefined;
const field = "mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3.5 text-[0.95rem] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

export interface CheckoutPrefill { email: string; fullName: string; phone: string; line1: string; line2: string; landmark: string; city: string; stateCode: string; pincode: string }
const EMPTY: CheckoutPrefill = { email: "", fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", stateCode: "", pincode: "" };

export function CheckoutForm({ buy, initialQuote, prefill, signedIn }: { buy: Buy; initialQuote: null; prefill?: Partial<CheckoutPrefill>; signedIn?: boolean }) {
  const [form, setForm] = useState<CheckoutPrefill>({ ...EMPTY, ...prefill });
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>();
  const [consent, setConsent] = useState({ sms: false, whatsapp: false, email: false, whatsappUpdates: false });
  const [q, setQ] = useState<Quote | null>(initialQuote);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Extract<PlaceResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const keyRef = useRef<string>("");
  const pay = useRazorpayPay();

  useEffect(() => { keyRef.current = crypto.randomUUID(); track("begin_checkout"); }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (placed) { setPlaced(null); keyRef.current = crypto.randomUUID(); } // details changed → new order attempt
  };

  const locationReady = form.stateCode && /^[1-9]\d{5}$/.test(form.pincode);
  useEffect(() => {
    if (!locationReady) return;
    let cancelled = false;
    void previewQuoteAction({ stateCode: form.stateCode, pincode: form.pincode, couponCode: appliedCoupon, email: form.email, buy }).then((r) => {
      if (cancelled) return;
      if (r.ok) { setQ(r.quote); setQuoteError(null); } else { setQ(null); setQuoteError(r.error || null); }
    });
    return () => { cancelled = true; };
  }, [form.stateCode, form.pincode, appliedCoupon, form.email, buy, locationReady]);

  const input = useMemo<CheckoutInput>(() => ({
    email: form.email,
    address: { fullName: form.fullName, phone: form.phone, line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, stateCode: form.stateCode, pincode: form.pincode },
    couponCode: appliedCoupon, idempotencyKey: keyRef.current || "00000000-0000-4000-8000-000000000000", buy, consent,
  }), [form, appliedCoupon, buy, consent]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      let p = placed;
      if (!p) {
        const r = await placeOrderAction({ ...input, idempotencyKey: keyRef.current });
        if (!r.ok) { setError({ text: r.error, field: r.field }); return; }
        p = r;
        setPlaced(r);
      }
      setStatus(null);
      try { await pay(p, !buy, setStatus); } catch (err) { setError({ text: (err as Error).message }); }
    });
  }

  const err = (f: string) => (error?.field === f ? <span role="alert" className="mt-1 block text-sm text-danger-700">{error.text}</span> : null);

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_24rem]" noValidate>
      <div className="space-y-6">
        <section className="rounded-card bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="contact-h">
          <h2 id="contact-h" className="font-display text-lg font-bold">Contact</h2>
          <label className="mt-4 block text-sm font-medium">Email<input type="email" required autoComplete="email" value={form.email} onChange={set("email")} className={field} />{err("email")}</label>
          <p className="mt-1 text-xs text-ink-muted">We’ll send your order confirmation and invoice here.{!signedIn && <> Have an account? <Link href="/account/login?next=/checkout" className="font-semibold text-brand-700 underline">Sign in</Link> for faster checkout — or continue as a guest.</>}</p>
        </section>

        <section className="rounded-card bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="addr-h">
          <h2 id="addr-h" className="font-display text-lg font-bold">Delivery address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Full name<input required autoComplete="name" value={form.fullName} onChange={set("fullName")} className={field} />{err("address.fullName")}</label>
            <label className="text-sm font-medium">Mobile number<input required type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={form.phone} onChange={set("phone")} className={field} />{err("address.phone")}</label>
            <label className="text-sm font-medium sm:col-span-2">Flat / house no., building, street<input required autoComplete="address-line1" value={form.line1} onChange={set("line1")} className={field} />{err("address.line1")}</label>
            <label className="text-sm font-medium">Area / locality <span className="font-normal text-ink-muted">(optional)</span><input autoComplete="address-line2" value={form.line2} onChange={set("line2")} className={field} /></label>
            <label className="text-sm font-medium">Landmark <span className="font-normal text-ink-muted">(optional)</span><input value={form.landmark} onChange={set("landmark")} className={field} /></label>
            <label className="text-sm font-medium">City<input required autoComplete="address-level2" value={form.city} onChange={set("city")} className={field} />{err("address.city")}</label>
            <label className="text-sm font-medium">Pincode<input required inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={set("pincode")} className={field} />{err("address.pincode")}</label>
            <label className="text-sm font-medium sm:col-span-2">State
              <select required autoComplete="address-level1" value={form.stateCode} onChange={set("stateCode")} className={field}>
                <option value="">Select state</option>
                {INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>{err("address.stateCode")}
            </label>
          </div>
        </section>

        <section className="rounded-card bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="msg-h">
          <h2 id="msg-h" className="font-display text-lg font-bold">Updates & offers</h2>
          <p className="mt-1 text-sm text-ink-muted">Order and delivery updates are always sent by email and SMS. Everything below is optional — you can change it any time.</p>
          <div className="mt-4 space-y-3 text-sm">
            <label className="flex items-start gap-3"><input type="checkbox" checked={consent.whatsappUpdates} onChange={(e) => setConsent((c) => ({ ...c, whatsappUpdates: e.target.checked }))} className="mt-0.5 size-5 accent-brand-600" />Also send order updates on WhatsApp</label>
            <fieldset className="space-y-3">
              <legend className="mb-1 font-semibold">Send me offers and new arrivals by:</legend>
              <label className="flex items-start gap-3"><input type="checkbox" checked={consent.sms} onChange={(e) => setConsent((c) => ({ ...c, sms: e.target.checked }))} className="mt-0.5 size-5 accent-brand-600" />SMS</label>
              <label className="flex items-start gap-3"><input type="checkbox" checked={consent.whatsapp} onChange={(e) => setConsent((c) => ({ ...c, whatsapp: e.target.checked }))} className="mt-0.5 size-5 accent-brand-600" />WhatsApp</label>
              <label className="flex items-start gap-3"><input type="checkbox" checked={consent.email} onChange={(e) => setConsent((c) => ({ ...c, email: e.target.checked }))} className="mt-0.5 size-5 accent-brand-600" />Email</label>
            </fieldset>
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-card bg-white p-5 ring-1 ring-line lg:sticky lg:top-36" aria-labelledby="sum-h">
        <h2 id="sum-h" className="font-display text-lg font-bold">Order summary</h2>
        {!q ? (
          <p className="text-sm text-ink-muted">{quoteError ?? "Enter your state and pincode to see delivery charges and your total."}</p>
        ) : (
          <>
            <ul className="divide-y divide-line text-sm">
              {q.lines.map((l) => (
                <li key={l.variantId} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">{l.productName}{l.variantLabel && <span className="text-ink-muted"> · {l.variantLabel}</span>} <span className="text-ink-muted">× {l.quantity}</span></span>
                  <span className="shrink-0">{formatPaise(l.unitPricePaise * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPaise(q.subtotalPaise)}</dd></div>
              {q.discountPaise > 0 && <div className="flex justify-between text-success-700"><dt>Coupon {q.couponCode}</dt><dd>−{formatPaise(q.discountPaise)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd>{q.shippingPaise ? formatPaise(q.shippingPaise) : "Free"}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd>{formatPaise(q.totalPaise)}</dd></div>
              <div className="flex justify-between text-xs text-ink-muted"><dt>Includes GST</dt><dd>{formatPaise(q.taxPaise)}</dd></div>
            </dl>
            <p className="text-xs text-ink-muted">Estimated delivery in {q.estDaysMin}–{q.estDaysMax} days.</p>
          </>
        )}
        <div>
          <label className="text-sm font-medium" htmlFor="coupon">Coupon code</label>
          <div className="mt-1.5 flex gap-2">
            <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} maxLength={20} className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong px-3 text-sm uppercase" />
            <button type="button" onClick={() => { setAppliedCoupon(coupon.trim() || undefined); if (placed) { setPlaced(null); keyRef.current = crypto.randomUUID(); } }} className="h-10 rounded-xl bg-white px-4 text-sm font-semibold ring-1 ring-line-strong hover:bg-canvas">Apply</button>
          </div>
          {appliedCoupon && q?.couponMessage && <p className={`mt-1 text-sm ${q.couponId ? "text-success-700" : "text-danger-700"}`}>{q.couponMessage}</p>}
        </div>
        {error && !error.field && <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700">{error.text}</p>}
        {error?.field && <p role="alert" className="text-sm text-danger-700">Please fix the highlighted field.</p>}
        {status && <p aria-live="polite" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{status}</p>}
        <button type="submit" disabled={pending || !q} className="h-12 w-full rounded-full bg-accent-400 font-semibold text-ink hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Please wait…" : q ? `Pay ${formatPaise(q.totalPaise)} securely` : "Pay securely"}
        </button>
        <p className="text-center text-xs text-ink-muted">Payments are processed by Razorpay: UPI, cards, net banking and wallets. By paying you agree to our <Link href="/policies/terms" className="underline">terms</Link>.</p>
        {placed && <p className="text-center text-xs text-ink-muted">Order {placed.orderNumber} · <Link href={`/order/${placed.orderNumber}?t=${encodeURIComponent(placed.token)}`} className="underline">view order</Link></p>}
      </aside>
    </form>
  );
}

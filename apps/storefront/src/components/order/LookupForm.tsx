"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { lookupOrderAction } from "@/lib/actions/checkout";

export function LookupForm() {
  const [state, action, pending] = useActionState(lookupOrderAction, undefined);
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.push(state.url); }, [state, router]);
  const field = "mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3.5";
  return (
    <form action={action} className="space-y-4 rounded-card bg-white p-6 ring-1 ring-line">
      <label className="block text-sm font-medium">Order number<input name="orderNumber" required placeholder="ZN261106100001" className={field} /></label>
      <label className="block text-sm font-medium">Email used for the order<input name="email" type="email" required className={field} /></label>
      <label className="block text-sm font-medium">Mobile number<input name="phone" type="tel" required className={field} /></label>
      {state && !state.ok && <p role="alert" className="text-sm text-danger-700">{state.error}</p>}
      <button disabled={pending} className="h-11 w-full rounded-full bg-brand-600 font-semibold text-white disabled:opacity-60">{pending ? "Looking up…" : "Find my order"}</button>
    </form>
  );
}

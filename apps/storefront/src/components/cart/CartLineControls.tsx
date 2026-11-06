"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { setCartQuantityAction } from "@/lib/actions/cart";

export function CartLineControls({ variantId, quantity, max, label }: { variantId: string; quantity: number; max: number; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const change = (q: number) =>
    start(async () => {
      const r = await setCartQuantityAction(variantId, q);
      setError(r.ok ? null : r.error ?? "Couldn’t update.");
      window.dispatchEvent(new Event("zentro:cart"));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Quantity for {label}</span>
        <select value={Math.min(quantity, Math.max(max, 1))} disabled={pending || max === 0} onChange={(e) => change(Number(e.target.value))} className="h-9 rounded-lg bg-white px-2 ring-1 ring-line-strong">
          {Array.from({ length: Math.max(1, Math.min(10, max)) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Qty {n}</option>)}
        </select>
      </label>
      <button type="button" disabled={pending} onClick={() => change(0)} className="text-sm font-semibold text-danger-700 hover:underline">Remove</button>
      {error && <span role="alert" className="text-sm text-danger-700">{error}</span>}
    </div>
  );
}

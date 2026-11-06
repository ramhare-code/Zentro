"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelOrderAction, retryPaymentAction } from "@/lib/actions/checkout";
import { useRazorpayPay } from "../checkout/PayButton";

export function OrderActions({ orderNumber, token, canCancel, canPay }: { orderNumber: string; token: string; canCancel: boolean; canPay: boolean }) {
  const router = useRouter();
  const pay = useRazorpayPay();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  if (!canCancel && !canPay && !msg) return null;
  return (
    <div className="space-y-3">
      {canPay && (
        <button type="button" disabled={pending} onClick={() => start(async () => {
          const r = await retryPaymentAction({ orderNumber, token });
          if (!r.ok) setMsg(r.error); else await pay(r, false, setMsg).catch((e: Error) => setMsg(e.message));
        })} className="h-11 w-full rounded-full bg-accent-400 font-semibold text-ink hover:bg-accent-500 disabled:opacity-60">Complete payment</button>
      )}
      {canCancel && !confirming && (
        <button type="button" onClick={() => setConfirming(true)} className="h-11 w-full rounded-full bg-white font-semibold text-danger-700 ring-1 ring-inset ring-line-strong hover:bg-danger-50">Cancel order</button>
      )}
      {confirming && (
        <div className="rounded-xl bg-danger-50 p-4">
          <label className="text-sm font-medium">Why are you cancelling? <span className="font-normal text-ink-muted">(optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-white px-3 text-sm" />
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={() => start(async () => {
              const r = await cancelOrderAction({ orderNumber, token, reason });
              setMsg(r.message); setConfirming(false); router.refresh();
            })} className="h-10 flex-1 rounded-full bg-danger-700 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Cancelling…" : "Yes, cancel"}</button>
            <button type="button" onClick={() => setConfirming(false)} className="h-10 flex-1 rounded-full bg-white text-sm font-semibold ring-1 ring-line-strong">Keep order</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{msg}</p>}
    </div>
  );
}

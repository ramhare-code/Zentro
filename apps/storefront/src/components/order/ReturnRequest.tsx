"use client";

import { useActionState, useState, useTransition } from "react";
import { requestReturnAction } from "@/lib/actions/returns";
import { fieldClass } from "../ui/ActionForm";

const REASONS: [string, string][] = [
  ["damaged", "Arrived damaged"], ["defective", "Doesn’t work / defective"], ["wrong_item", "Wrong item sent"],
  ["not_as_described", "Not as described"], ["size_fit", "Size or fit issue"], ["changed_mind", "Changed my mind"], ["other", "Other"],
];

export function ReturnRequest({ orderNumber, token, items, deadline }: { orderNumber: string; token: string; items: { id: string; name: string; available: number }[]; deadline: string }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pa] = useActionState(requestReturnAction, undefined);
  const [pt, start] = useTransition();
  if (state?.ok) return <p role="status" className="rounded-xl bg-success-50 p-4 text-sm text-success-700">{state.message}</p>;
  if (!open) {
    return (
      <div className="rounded-card bg-white p-5 text-sm ring-1 ring-line">
        <p className="font-semibold">Need to return something?</p>
        <p className="mt-1 text-ink-muted">You can request a return until {deadline}.</p>
        <button type="button" onClick={() => setOpen(true)} className="mt-3 h-10 w-full rounded-full bg-white font-semibold ring-1 ring-inset ring-line-strong hover:bg-canvas">Request a return</button>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); start(() => dispatch(d)); }} className="space-y-4 rounded-card bg-white p-5 text-sm ring-1 ring-line">
      <h2 className="font-semibold">Request a return</h2>
      <input type="hidden" name="orderNumber" value={orderNumber} /><input type="hidden" name="token" value={token} />
      <fieldset className="space-y-2">
        <legend className="font-medium">What are you returning?</legend>
        {items.map((i) => (
          <label key={i.id} className="flex items-center justify-between gap-3">
            <span>{i.name}</span>
            <select name={`qty:${i.id}`} defaultValue="0" aria-label={`Quantity of ${i.name} to return`} className="h-9 rounded-lg bg-white px-2 ring-1 ring-line-strong">
              {Array.from({ length: i.available + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </fieldset>
      <label className="block font-medium">Reason<select name="reason" required defaultValue="" className={fieldClass}><option value="" disabled>Choose a reason</option>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="block font-medium">Details <span className="font-normal text-ink-muted">(optional)</span><textarea name="details" rows={3} maxLength={2000} className={`${fieldClass} h-auto py-2`} /></label>
      {state?.error && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-danger-700">{state.error}</p>}
      <button type="submit" disabled={pa || pt} className="h-11 w-full rounded-full bg-brand-600 font-semibold text-white disabled:opacity-60">{pa || pt ? "Submitting…" : "Submit return request"}</button>
    </form>
  );
}

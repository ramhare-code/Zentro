"use client";

import { useActionState, useState, useTransition } from "react";
import { submitReviewAction } from "@/lib/actions/engage";
import { fieldClass } from "../ui/ActionForm";

/** Stays mounted through server refreshes so the result message isn't lost. */
export function ReviewForm({ orderNumber, token, orderItemId, productName, defaultName, reviewed }: { orderNumber: string; token: string; orderItemId: string; productName: string; defaultName: string; reviewed: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pendingA] = useActionState(submitReviewAction, undefined);
  const [pendingT, start] = useTransition();
  if (state?.ok) return <p role="status" className="mt-2 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">{state.message}</p>;
  if (reviewed) return <span className="mt-1 block text-xs font-semibold text-success-700">Reviewed — thank you</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">Write a review</button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); start(() => dispatch(d)); }} className="mt-3 space-y-3 rounded-xl bg-canvas p-4">
      <input type="hidden" name="orderNumber" value={orderNumber} /><input type="hidden" name="token" value={token} /><input type="hidden" name="orderItemId" value={orderItemId} />
      <fieldset>
        <legend className="text-sm font-semibold">Your rating for {productName}</legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} required className="peer sr-only" />
              <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-white text-sm font-bold ring-1 ring-line-strong peer-checked:bg-accent-400 peer-checked:ring-accent-500 peer-focus-visible:outline-3 peer-focus-visible:outline-brand-500">{n}★</span>
              <span className="sr-only">{n} star{n > 1 ? "s" : ""}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium">Headline <span className="font-normal text-ink-muted">(optional)</span><input name="title" maxLength={120} className={fieldClass} /></label>
      <label className="block text-sm font-medium">Your review <span className="font-normal text-ink-muted">(optional)</span><textarea name="body" maxLength={4000} rows={4} className={`${fieldClass} h-auto py-2`} /></label>
      <label className="block text-sm font-medium">Name shown<input name="displayName" defaultValue={defaultName} required maxLength={60} className={fieldClass} /></label>
      <p className="text-xs text-ink-muted">Reviews are labelled “Verified buyer”. Links, phone numbers and abusive language are held for a quick check.</p>
      {state?.error && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{state.error}</p>}
      <button type="submit" disabled={pendingA || pendingT} className="h-11 rounded-full bg-brand-600 px-6 font-semibold text-white disabled:opacity-60">{pendingA || pendingT ? "Please wait…" : "Submit review"}</button>
    </form>
  );
}

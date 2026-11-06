"use client";

import { useActionState, useTransition } from "react";
import { formatPaise } from "@zentro/commerce";
import { settlementImportAction, type SettlementResult } from "@/lib/actions/payments";

const KIND = { amount_mismatch: "Amount differs", status_mismatch: "Status differs", unknown: "Not in Zentro" } as const;

export function SettlementForm() {
  const [state, dispatch, pa] = useActionState(settlementImportAction, undefined as SettlementResult);
  const [pt, start] = useTransition();
  const busy = pa || pt;
  const p = state?.preview;
  return (
    <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter); start(() => dispatch(d)); }}>
      <div>
        <h2 className="font-semibold">Match a settlement report</h2>
        <p className="mt-1 text-sm text-ink-muted">In Razorpay, download a Settlement recon (or Payments) report as CSV and upload it. Each line is matched to Zentro by its Razorpay id. “Check” only compares; “Record” saves fees and settlement ids for lines that match exactly. Nothing else is changed.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Report (CSV)<input type="file" name="file" accept=".csv,text/csv" required className="mt-1.5 block text-sm" /></label>
        <label className="text-sm font-medium">Amounts are in<select name="unit" className="input mt-1.5 h-10 w-36"><option value="rupees">Rupees</option><option value="paise">Paise</option></select></label>
        <button type="submit" name="mode" value="preview" disabled={busy} className="btn btn-secondary">{busy ? "Checking…" : "Check report"}</button>
        <button type="submit" name="mode" value="commit" disabled={busy || !p} className="btn btn-primary">Record matches</button>
      </div>
      {p && (
        <div className="rounded-xl bg-canvas p-4 text-sm" aria-live="polite" aria-label="Report check">
          <p className="font-semibold">{p.lines} line(s): {p.payments} payment(s), {p.refunds} refund(s), {p.other} other · {p.matched} matched · {p.problems.length} need attention</p>
          <p className="mt-1 text-ink-muted">Gateway fees in report: {formatPaise(p.feesPaise)} · Net settled (payments − fees − refunds): {formatPaise(p.settledPaise)}</p>
          {p.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-bad-700">{p.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          {p.problems.length > 0 && <ul className="mt-3 divide-y divide-line rounded-lg bg-white">{p.problems.map((x) => <li key={x.entityId} className="flex flex-wrap gap-x-3 px-3 py-2"><code className="text-xs">{x.entityId}</code><span className="font-semibold text-warn-700">{KIND[x.kind]}</span><span className="text-ink-muted">{x.detail}</span></li>)}</ul>}
        </div>
      )}
      {state?.error && <p role="alert" className="rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm text-bad-700">{state.error}</p>}
      {state?.message && <p role="status" className="rounded-xl bg-good-50 px-3.5 py-2.5 text-sm text-good-700">{state.message}</p>}
    </form>
  );
}

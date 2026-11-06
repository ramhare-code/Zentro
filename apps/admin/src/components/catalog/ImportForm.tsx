"use client";

import { useActionState, useTransition } from "react";
import { importCsvAction, type ImportResult } from "@/lib/actions/catalog";

export function ImportForm() {
  const [state, dispatch, pa] = useActionState(importCsvAction, undefined as ImportResult);
  const [pt, start] = useTransition();
  const busy = pa || pt;
  return (
    <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter); start(() => dispatch(d)); }}>
      <label className="block text-sm font-medium">CSV file<input type="file" name="file" accept=".csv,text/csv" required className="mt-1.5 block w-full text-sm" /></label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="mode" value="preview" disabled={busy} className="btn btn-secondary">{busy ? "Checking…" : "Check file"}</button>
        <button type="submit" name="mode" value="commit" disabled={busy || !state?.preview || state.preview.errors.length > 0} className="btn btn-primary">Import</button>
      </div>
      {state?.preview && (
        <div className="rounded-xl bg-canvas p-4 text-sm" aria-live="polite">
          <p className="font-semibold">{state.preview.rows} row(s): {state.preview.newProducts} new product(s), {state.preview.updatedProducts} to update · {state.preview.newVariants} new variant(s), {state.preview.updatedVariants} to update</p>
          {state.preview.errors.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-bad-700">{state.preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
      {state?.error && <p role="alert" className="rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm text-bad-700">{state.error}</p>}
      {state?.message && <p role="status" className="rounded-xl bg-good-50 px-3.5 py-2.5 text-sm text-good-700">{state.message}</p>}
    </form>
  );
}

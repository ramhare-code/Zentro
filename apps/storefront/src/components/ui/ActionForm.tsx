"use client";

import { createContext, useActionState, useContext, useTransition } from "react";
import clsx from "clsx";

type Result = { ok?: boolean; error?: string; message?: string } | undefined;
const Pending = createContext(false);

export function Submit({ children, className, variant = "primary", confirm }: { children: React.ReactNode; className?: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }) {
  const pending = useContext(Pending);
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={clsx("inline-flex h-11 items-center justify-center rounded-full px-6 font-semibold transition-colors disabled:opacity-60",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700",
        variant === "secondary" && "bg-white text-ink ring-1 ring-inset ring-line-strong hover:bg-canvas",
        variant === "danger" && "bg-danger-700 text-white hover:bg-danger-700/90", className)}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

/** Server-action form that keeps what was typed if the server returns an error. */
export function ActionForm({ action, children, className }: { action: (p: Result, f: FormData) => Promise<Result>; children: React.ReactNode; className?: string }) {
  const [state, dispatch, pendingA] = useActionState(action, undefined);
  const [pendingT, start] = useTransition();
  return (
    <form className={className} onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter); start(() => dispatch(d)); }}>
      <Pending.Provider value={pendingA || pendingT}>{children}</Pending.Provider>
      {state?.error && <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">{state.error}</p>}
      {state?.message && <p role="status" className="mt-3 rounded-xl bg-success-50 px-3.5 py-2.5 text-sm text-success-700">{state.message}</p>}
    </form>
  );
}

export const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3.5 text-[0.95rem] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

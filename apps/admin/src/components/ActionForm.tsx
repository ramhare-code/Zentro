"use client";

import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import clsx from "clsx";

type Result = { ok?: boolean; error?: string; needsReauth?: boolean; message?: string; secret?: string } | undefined;

export function SubmitButton({ children, variant = "primary", className, confirm }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={clsx("btn", `btn-${variant}`, className)}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function ResultMessage({ state }: { state: Result }) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="mt-3 rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm text-bad-700">
        {state.error}{" "}
        {state.needsReauth && <Link href={`/reauth?next=${encodeURIComponent(pathname)}`} className="font-semibold underline">Confirm now</Link>}
      </p>
    );
  }
  return (
    <div role="status" className="mt-3 rounded-xl bg-good-50 px-3.5 py-2.5 text-sm text-good-700">
      {state.message}
      {state.secret && (
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 font-mono text-xs text-ink ring-1 ring-line">{state.secret}</code>
          <button type="button" className="btn btn-secondary h-8 px-3" onClick={() => navigator.clipboard.writeText(state.secret!).then(() => setCopied(true))}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ActionForm({ action, children, className }: { action: (prev: Result, form: FormData) => Promise<Result>; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <ResultMessage state={state} />
    </form>
  );
}

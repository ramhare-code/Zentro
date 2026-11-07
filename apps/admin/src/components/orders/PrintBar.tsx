"use client";

import Link from "next/link";

export function PrintBar({ back, count, note }: { back: string; count: number; note?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div><Link href={back} className="text-sm font-semibold text-brand-700 hover:underline">← Back</Link>{note && <p className="text-sm text-ink-muted">{note}</p>}</div>
      {count > 0 && <button type="button" onClick={() => window.print()} className="btn btn-primary">Print {count} label{count === 1 ? "" : "s"}</button>}
    </div>
  );
}

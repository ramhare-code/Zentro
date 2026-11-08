"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Live "ends in" timer. Renders nothing on the server, so cached pages never show a stale time. */
export function Countdown({ endsAt, size = "sm", className }: { endsAt: string; size?: "sm" | "lg"; className?: string }) {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className={clsx("inline-block", size === "lg" ? "h-16" : "h-5", className)} aria-hidden />;
  if (now >= end) return <span className={className}>Sale has ended</span>;
  const p = parts(end - now);
  const label = `Ends in ${p.d} days ${p.h} hours ${p.m} minutes`;
  if (size === "sm") {
    return (
      <span className={clsx("font-mono tabular-nums", className)} role="timer" aria-label={label}>
        <span aria-hidden>{p.d > 0 && `${p.d}d `}{String(p.h).padStart(2, "0")}h {String(p.m).padStart(2, "0")}m {String(p.s).padStart(2, "0")}s</span>
      </span>
    );
  }
  const units = [["Days", p.d], ["Hours", p.h], ["Mins", p.m], ["Secs", p.s]] as const;
  return (
    <div className={clsx("flex gap-2 sm:gap-3", className)} role="timer" aria-label={label}>
      {units.map(([u, v]) => (
        <div key={u} aria-hidden className="grid w-16 place-items-center rounded-2xl bg-white/15 py-2 ring-1 ring-white/25 backdrop-blur sm:w-20">
          <span className="font-display text-2xl font-extrabold tabular-nums sm:text-3xl">{String(v).padStart(2, "0")}</span>
          <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-white/80">{u}</span>
        </div>
      ))}
    </div>
  );
}

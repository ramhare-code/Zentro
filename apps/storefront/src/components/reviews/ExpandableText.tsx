"use client";

import { useState } from "react";

/** Long review text is clamped to a few lines with a "Read more" toggle. */
export function ExpandableText({ text, lines = 5 }: { text: string; lines?: number }) {
  const long = text.length > 400 || text.split("\n").length > lines;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink" style={long && !open ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{text}</p>
      {long && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 text-sm font-semibold text-brand-700 hover:underline">{open ? "Show less" : "Read more"}</button>}
    </div>
  );
}

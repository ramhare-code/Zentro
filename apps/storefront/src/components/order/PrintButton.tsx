"use client";
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="h-10 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Print / save as PDF</button>;
}

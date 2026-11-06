import Link from "next/link";
import clsx from "clsx";
import { RANGE_PRESETS, type DateRange } from "@/lib/metrics";

export function RangePicker({ range }: { range: DateRange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Date range" className="flex rounded-xl bg-white p-1 ring-1 ring-line">
        {Object.keys(RANGE_PRESETS).map((key) => (
          <Link key={key} href={`?range=${key}`} aria-current={range.key === key ? "true" : undefined}
            className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold", range.key === key ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-canvas")}>
            {key}
          </Link>
        ))}
      </nav>
      <form className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="from">From</label>
        <input id="from" type="date" name="from" defaultValue={range.key === "custom" ? range.from : undefined} className="input h-9 w-36 text-sm" />
        <label className="sr-only" htmlFor="to">To</label>
        <input id="to" type="date" name="to" defaultValue={range.key === "custom" ? range.to : undefined} className="input h-9 w-36 text-sm" />
        <button className="btn btn-secondary h-9">Apply</button>
      </form>
    </div>
  );
}

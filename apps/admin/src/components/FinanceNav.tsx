import Link from "next/link";
import clsx from "clsx";
import { RangePicker } from "./RangePicker";
import type { DateRange } from "@/lib/metrics";

const TABS = [["/finance", "Profit"], ["/finance/gst", "GST"], ["/finance/registers", "Invoices & credit notes"]] as const;

export function FinanceNav({ active, title, range, exportHref }: { active: string; title: string; range: DateRange; exportHref?: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-2"><RangePicker range={range} />{exportHref && <a href={exportHref} className="btn btn-secondary h-9">Export CSV</a>}</div>
      </div>
      <nav aria-label="Finance" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={`${href}?${range.key === "custom" ? `from=${range.from}&to=${range.to}` : `range=${range.key}`}`} aria-current={active === href ? "page" : undefined} className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", active === href ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-white")}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

export const rangeQs = (r: DateRange) => `from=${r.from}&to=${r.to}`;

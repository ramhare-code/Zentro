import Link from "next/link";
import clsx from "clsx";
import type { DateRange } from "@/lib/metrics";

const TABS = [["/analytics", "Visitors"], ["/analytics/customers", "Customers & sales"], ["/analytics/reports", "Reports & exports"]] as const;

export function AnalyticsNav({ active, range }: { active: string; range?: DateRange }) {
  const qs = range ? (range.key === "custom" ? `?from=${range.from}&to=${range.to}` : `?range=${range.key}`) : "";
  return (
    <nav aria-label="Analytics" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {TABS.map(([href, label]) => (
        <Link key={href} href={`${href}${qs}`} aria-current={active === href ? "page" : undefined} className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", active === href ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-white")}>{label}</Link>
      ))}
    </nav>
  );
}

import Link from "next/link";
import clsx from "clsx";

const TABS = [["/inventory", "Stock levels"], ["/inventory/movements", "Movement history"], ["/inventory/counts", "Stock counts"], ["/purchase-orders", "Purchase orders"], ["/suppliers", "Suppliers"]] as const;

export function InventoryNav({ active, title, children }: { active: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{children}</div>
      <nav aria-label="Inventory" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", active === href ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-white")}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

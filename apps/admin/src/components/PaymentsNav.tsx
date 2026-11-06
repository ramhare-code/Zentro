import Link from "next/link";
import clsx from "clsx";

const TABS = [["/payments", "Payments"], ["/payments/reconcile", "Reconciliation"], ["/payments/webhooks", "Gateway events"], ["/refunds", "Refunds"]] as const;

export function PaymentsNav({ active, title, children }: { active: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{children}</div>
      <nav aria-label="Payments" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", active === href ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-white")}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

const tone: Record<string, string> = { created: "bg-warn-50 text-warn-700", authorized: "bg-info-50 text-info-700", captured: "bg-good-50 text-good-700", failed: "bg-bad-50 text-bad-700", refunded: "bg-canvas text-ink-muted", partially_refunded: "bg-warn-50 text-warn-700" };
const label: Record<string, string> = { created: "Awaiting payment", authorized: "Authorised", captured: "Captured", failed: "Failed", refunded: "Refunded", partially_refunded: "Partly refunded" };
export function PayStatus({ status }: { status: string }) {
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone[status])}>{label[status] ?? status}</span>;
}

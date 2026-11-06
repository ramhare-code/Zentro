import Link from "next/link";
import clsx from "clsx";

const TABS = [
  ["/messages", "Overview"], ["/messages/compose", "Compose"], ["/messages/campaigns", "Campaigns"], ["/messages/scheduled", "Scheduled"],
  ["/messages/templates", "Templates"], ["/messages/history", "History"], ["/messages/analytics", "Analytics"],
  ["/messages/consent", "Consent"], ["/messages/settings", "Settings"],
] as const;

export function MessagesNav({ active, title, children }: { active: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-700">Customer Communication Center</p>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {children}
      </div>
      <nav aria-label="Messaging" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={active === href ? "page" : undefined}
            className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", active === href ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-white")}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export const CHANNEL_LABEL = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" } as const;

export function MsgStatus({ status }: { status: string }) {
  const tone: Record<string, string> = {
    sent: "bg-info-50 text-info-700", delivered: "bg-good-50 text-good-700", read: "bg-good-50 text-good-700",
    queued: "bg-canvas text-ink-muted", sending: "bg-canvas text-ink-muted", failed: "bg-bad-50 text-bad-700",
    skipped: "bg-warn-50 text-warn-700", suppressed: "bg-warn-50 text-warn-700", cancelled: "bg-canvas text-ink-muted",
  };
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone[status])}>{status}</span>;
}

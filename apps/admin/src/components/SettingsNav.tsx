import Link from "next/link";
import clsx from "clsx";
import type { StaffSession } from "@/lib/session";

export function SettingsNav({ active, title, s }: { active: string; title: string; s: StaffSession }) {
  const tabs = [["/settings", "Store details", "settings.manage"], ["/settings/shipping", "Shipping & delivery", "settings.manage"], ["/settings/tax", "Tax", "tax.manage"]] as const;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <nav aria-label="Settings" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.filter(([, , p]) => s.permissions.has(p)).map(([href, label]) => (
          <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", active === href ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-white")}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

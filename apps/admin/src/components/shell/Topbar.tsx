import Link from "next/link";
import clsx from "clsx";
import { logoutAction } from "@/lib/actions/auth";
import type { Alert } from "@/lib/alerts";
import { Icon } from "../Icon";
import { Sidebar, type SidebarSection } from "./Sidebar";

const sev = { critical: "bg-bad-700", warning: "bg-warn-700", info: "bg-info-700" } as const;

export function Topbar({ sections, alerts, name, role }: { sections: SidebarSection[]; alerts: Alert[]; name: string; role: string }) {
  const total = alerts.length;
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
      <Sidebar sections={sections} />
      <form action="/search" role="search" className="max-w-xl flex-1">
        <label className="relative block">
          <span className="sr-only">Search orders, products and customers</span>
          <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input name="q" type="search" maxLength={100} placeholder="Search orders, products, customers…" className="h-10 w-full rounded-xl bg-canvas pl-10 pr-3 text-sm ring-1 ring-line focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </label>
      </form>

      <div className="ml-auto flex items-center gap-1">
        <details className="group relative">
          <summary className="relative grid size-10 cursor-pointer list-none place-items-center rounded-lg hover:bg-ink/5" aria-label={`Alerts (${total})`}>
            <Icon name="bell" size={19} />
            {total > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-bad-700 px-1 text-[0.65rem] font-bold text-white">{total}</span>}
          </summary>
          <div className="absolute right-0 top-12 w-80 rounded-2xl bg-white p-2 shadow-pop ring-1 ring-line">
            <p className="px-3 py-2 text-sm font-semibold">Alerts</p>
            {total === 0 ? (
              <p className="px-3 pb-3 text-sm text-ink-muted">All clear — nothing needs attention.</p>
            ) : (
              <ul>
                {alerts.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas">
                      <span aria-hidden className={clsx("mt-1.5 size-2 shrink-0 rounded-full", sev[a.severity])} />
                      <span><span className="block text-sm font-semibold">{a.title}<span className="sr-only"> ({a.severity})</span></span><span className="block text-xs text-ink-muted">{a.detail}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/notifications" className="mt-1 block rounded-xl px-3 py-2 text-center text-sm font-semibold text-brand-700 hover:bg-brand-50">View all alerts</Link>
          </div>
        </details>

        <details className="relative">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-ink/5">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{name.slice(0, 1).toUpperCase()}</span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold leading-tight">{name}</span>
              <span className="block text-xs leading-tight text-ink-muted">{role}</span>
            </span>
          </summary>
          <div className="absolute right-0 top-12 w-56 rounded-2xl bg-white p-2 shadow-pop ring-1 ring-line">
            <Link href="/account/security" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-canvas"><Icon name="lock" size={16} />Security & sessions</Link>
            <form action={logoutAction}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-bad-700 hover:bg-bad-50"><Icon name="logout" size={16} />Sign out</button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}

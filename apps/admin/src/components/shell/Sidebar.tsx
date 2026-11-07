"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Icon } from "../Icon";

export interface SidebarSection { section: string; items: { href: string; label: string; icon: string; phase: number }[] }

export function Sidebar({ sections }: { sections: SidebarSection[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-6">
      {sections.map((s) => (
        <div key={s.section} className="mt-5">
          <p className="px-3 text-[0.7rem] font-semibold uppercase tracking-wider text-white/70">{s.section}</p>
          <ul className="mt-1.5 space-y-0.5">
            {s.items.map((i) => {
              const active = pathname === i.href || pathname.startsWith(i.href + "/");
              return (
                <li key={i.href}>
                  <Link href={i.href} aria-current={active ? "page" : undefined}
                    className={clsx("flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                      active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/6 hover:text-white")}>
                    <Icon name={i.icon} size={17} />
                    <span className="flex-1">{i.label}</span>
                    {i.phase > 1 && <span className="rounded bg-white/10 px-1.5 text-[0.65rem] text-white/50" title={`Available in build phase ${i.phase}`}>P{i.phase}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-2.5 px-6 text-white">
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 font-extrabold">Z</span>
      <span className="font-bold tracking-tight">Zentro <span className="font-medium text-white/50">Admin</span></span>
    </Link>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" className="grid size-10 place-items-center rounded-lg hover:bg-ink/5 lg:hidden">
        <Icon name="menu" size={20} />
      </button>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex print:!hidden">{brand}{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink/50 lg:hidden" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-label="Navigation" className="flex h-full w-72 flex-col bg-sidebar">
            <div className="flex items-center justify-between pr-3">{brand}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="grid size-10 place-items-center rounded-lg text-white hover:bg-white/10"><Icon name="close" /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}

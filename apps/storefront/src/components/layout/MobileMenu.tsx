"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon } from "../icons";

interface NavCategory {
  slug: string;
  name: string;
  children: { slug: string; name: string }[];
}

export function MobileMenu({ categories }: { categories: NavCategory[] }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-11 place-items-center rounded-full hover:bg-ink/5 lg:hidden"
        aria-label="Open menu"
        aria-haspopup="dialog"
      >
        <MenuIcon />
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        aria-label="Menu"
        className="m-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none bg-white p-0 shadow-pop backdrop:bg-ink/40"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="font-display text-lg font-bold">Shop by category</span>
          <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-ink/5" aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
        <nav aria-label="Categories" className="overflow-y-auto px-3 py-3">
          <ul className="space-y-1">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-brand-50">{c.name}</Link>
                {c.children.length > 0 && (
                  <ul className="mb-2 ml-3 border-l border-line pl-3">
                    {c.children.map((s) => (
                      <li key={s.slug}>
                        <Link href={`/c/${s.slug}`} className="block rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-brand-50 hover:text-ink">{s.name}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <hr className="my-3 border-line" />
          <ul className="space-y-1 text-sm">
            <li><Link href="/account" className="block rounded-xl px-3 py-2.5 hover:bg-brand-50">My account</Link></li>
            <li><Link href="/account/orders" className="block rounded-xl px-3 py-2.5 hover:bg-brand-50">My orders</Link></li>
            <li><Link href="/help" className="block rounded-xl px-3 py-2.5 hover:bg-brand-50">Help centre</Link></li>
          </ul>
        </nav>
      </dialog>
    </>
  );
}

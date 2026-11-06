"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { CartIcon, GridIcon, HeartIcon, HomeIcon, UserIcon } from "../icons";

const tabs = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/categories", label: "Categories", icon: GridIcon, match: (p: string) => p.startsWith("/c") || p === "/categories" },
  { href: "/wishlist", label: "Wishlist", icon: HeartIcon, match: (p: string) => p.startsWith("/wishlist") },
  { href: "/account", label: "Account", icon: UserIcon, match: (p: string) => p.startsWith("/account") },
  { href: "/cart", label: "Cart", icon: CartIcon, match: (p: string) => p.startsWith("/cart") },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx("flex h-15 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium", active ? "text-brand-700" : "text-ink-muted")}
              >
                <Icon size={21} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

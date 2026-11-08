import Link from "next/link";
import { Suspense } from "react";
import { getCategories } from "@/lib/catalog";
import { getCurrentSale } from "@/lib/sale";
import { CartIcon, HeartIcon, UserIcon } from "../icons";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { SearchBox } from "./SearchBox";
import { CartBadge } from "./CartBadge";

export async function SiteHeader() {
  const [all, sale] = await Promise.all([getCategories(), getCurrentSale()]);
  const nav = all
    .filter((c) => !c.parentId)
    .map((c) => ({ slug: c.slug, name: c.name, children: all.filter((s) => s.parentId === c.id).map(({ slug, name }) => ({ slug, name })) }));

  const iconLink = "relative grid size-11 place-items-center rounded-full text-ink hover:bg-ink/5";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4 lg:h-[4.5rem]">
        <MobileMenu categories={nav} />
        <Logo className="shrink-0" />
        <Suspense fallback={<div className="hidden h-11 flex-1 md:block" />}>
          <SearchBox className="mx-2 hidden flex-1 md:block lg:mx-6" />
        </Suspense>
        <nav aria-label="Account" className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <Link href="/account" className={`${iconLink} hidden lg:grid`} aria-label="Account">
            <UserIcon />
          </Link>
          <Link href="/wishlist" className={`${iconLink} hidden sm:grid`} aria-label="Wishlist">
            <HeartIcon />
          </Link>
          <Link href="/cart" className={iconLink} aria-label="Cart">
            <CartIcon />
            <CartBadge />
          </Link>
        </nav>
      </div>
      <div className="container-page pb-3 md:hidden">
        <Suspense fallback={<div className="h-11" />}>
          <SearchBox />
        </Suspense>
      </div>
      <nav aria-label="Categories" className="hidden border-t border-line lg:block">
        <ul className="container-page flex h-11 items-center gap-1">
          {nav.map((c) => (
            <li key={c.slug} className="group relative">
              <Link href={`/c/${c.slug}`} className="inline-flex h-11 items-center px-3 text-sm font-semibold text-ink-muted hover:text-brand-700">
                {c.name}
              </Link>
              {c.children.length > 0 && (
                <ul className="invisible absolute left-0 top-full z-50 min-w-52 rounded-2xl bg-white p-2 opacity-0 shadow-pop ring-1 ring-line transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {c.children.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/c/${s.slug}`} className="block rounded-xl px-3 py-2 text-sm hover:bg-brand-50">{s.name}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {sale && (
            <li>
              <Link href="/sale" className="inline-flex h-8 items-center rounded-full bg-[#8a1c3d] px-3 text-sm font-bold text-white hover:bg-[#6f1631]">{sale.badge}</Link>
            </li>
          )}
          <li className="ml-auto">
            <Link href="/help" className="inline-flex h-11 items-center px-3 text-sm font-semibold text-ink-muted hover:text-brand-700">Help centre</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

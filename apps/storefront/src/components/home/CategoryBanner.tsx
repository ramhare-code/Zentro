import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import type { Banner } from "@/lib/catalog";

export function CategoryBanner({ banner: b }: { banner: Banner }) {
  const dark = b.theme === "dark";
  const body = (
    <div className="relative isolate mt-5 flex min-h-36 items-center overflow-hidden rounded-card p-6 sm:min-h-44 sm:p-8">
      <Image src={b.imageUrl} alt="" fill sizes="(min-width: 1280px) 1200px, 100vw" className="-z-10 object-cover" />
      <div className={clsx("absolute inset-0 -z-10", dark ? "bg-gradient-to-r from-black/70 to-black/10" : "bg-gradient-to-r from-white/85 to-white/20")} />
      <div className={clsx("max-w-lg", dark ? "text-white" : "text-ink")}>
        <p className="font-display text-xl font-bold sm:text-2xl">{b.title}</p>
        {b.subtitle && <p className="mt-1 text-sm opacity-90">{b.subtitle}</p>}
        {b.ctaLabel && b.ctaHref && <span className={clsx("mt-3 inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold", dark ? "bg-white text-ink" : "bg-ink text-white")}>{b.ctaLabel}</span>}
      </div>
    </div>
  );
  return b.ctaHref ? <Link href={b.ctaHref} aria-label={b.ctaLabel ? `${b.title} — ${b.ctaLabel}` : b.title} className="block">{body}</Link> : <section aria-label={b.title}>{body}</section>;
}

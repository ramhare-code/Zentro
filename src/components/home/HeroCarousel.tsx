"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import type { Banner } from "@/lib/catalog";
import { ChevronLeft, ChevronRight } from "../icons";

const INTERVAL_MS = 6000;

export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;
  const go = useCallback((i: number) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  if (!count) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured offers"
      className="container-page pt-4 sm:pt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-[1.75rem] bg-brand-900 shadow-card">
        {banners.map((b, i) => (
          <div
            key={b.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
            inert={i !== index}
            className={clsx("transition-opacity duration-700", i === index ? "relative opacity-100" : "absolute inset-0 opacity-0")}
          >
            <div className="relative aspect-[4/5] sm:aspect-[16/7] lg:aspect-[16/6]">
              <picture>
                {b.imageMobileUrl && <source media="(max-width: 639px)" srcSet={b.imageMobileUrl} />}
                <Image src={b.imageUrl} alt="" fill priority={i === 0} sizes="(min-width: 1280px) 1216px, 100vw" className="object-cover" />
              </picture>
              <div className={clsx("absolute inset-0", b.theme === "dark" ? "bg-gradient-to-t from-brand-900/90 via-brand-900/50 to-brand-900/10 sm:bg-gradient-to-r sm:from-brand-900/90 sm:via-brand-900/55 sm:to-transparent" : "bg-gradient-to-r from-white/90 to-transparent")} />
              <div className={clsx("absolute inset-x-0 bottom-0 p-6 sm:inset-y-0 sm:flex sm:max-w-xl sm:flex-col sm:justify-center sm:p-12", b.theme === "dark" ? "text-white" : "text-ink")}>
                <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{b.title}</h2>
                {b.subtitle && <p className="mt-3 text-base opacity-90 sm:text-lg">{b.subtitle}</p>}
                {b.ctaHref && b.ctaLabel && (
                  <Link href={b.ctaHref} className="mt-6 inline-flex h-12 w-fit items-center rounded-full bg-accent-400 px-7 font-semibold text-ink hover:bg-accent-500">
                    {b.ctaLabel}
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow hover:bg-white sm:grid">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow hover:bg-white sm:grid">
              <ChevronRight />
            </button>
            <div className="absolute bottom-4 right-5 flex gap-1.5 sm:left-12 sm:right-auto">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  className={clsx("h-2.5 rounded-full transition-all", i === index ? "w-7 bg-white" : "w-2.5 bg-white/50 hover:bg-white/80")}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

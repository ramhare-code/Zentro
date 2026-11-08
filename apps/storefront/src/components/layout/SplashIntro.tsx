"use client";

import { useAnimate } from "motion/react";
import { useEffect, useState } from "react";
import { SITE_NAME } from "@/lib/site";
import { SMILE_PATH, Z_PATH } from "./BrandMark";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/**
 * Opening animation: the Z draws itself, an orange smile sweeps beneath it,
 * the name appears letter by letter, then the whole logo glides into the
 * header logo's exact position while the backdrop fades to reveal the page.
 * The overlay ignores pointer events, so the site is usable throughout.
 */
export function SplashIntro() {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("intro-playing")) {
      setDone(true);
      return;
    }
    let cancelled = false;
    const finish = () => {
      html.classList.remove("intro-playing");
      html.classList.add("intro-reveal");
      setDone(true);
    };

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      try {
        const root = scope.current;
        const group = root?.querySelector<HTMLElement>("[data-intro-group]");
        const tile = root?.querySelector("[data-intro-tile]");
        if (!root || !group || !tile) return;
        // Start with the tile alone in the centre; the word slides in beside it.
        const centreShift = (group.getBoundingClientRect().width - tile.getBoundingClientRect().width) / 2;
        group.style.transform = `translateX(${centreShift}px)`;

        await Promise.all([
          animate(tile, { opacity: [0, 1], scale: [0.55, 1], rotate: [-12, 0] }, { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }),
          animate("[data-intro-z]", { opacity: [0, 1], pathLength: [0, 1] }, { duration: 0.45, delay: 0.2, ease: EASE_OUT }),
          animate("[data-intro-smile]", { opacity: [0, 1], pathLength: [0, 1] }, { duration: 0.4, delay: 0.55, ease: EASE_OUT }),
          animate(group, { x: [centreShift, 0] }, { duration: 0.5, delay: 0.7, ease: EASE_OUT }),
          animate("[data-intro-letter]", { opacity: [0, 1], y: ["0.3em", "0em"] }, { duration: 0.3, delay: (i: number) => 0.8 + i * 0.045, ease: EASE_OUT }),
        ]);
        await wait(200);
        if (cancelled) return;

        // Glide into the header logo, measured now so it lands exactly on any screen size.
        const target = document.querySelector("header [data-brand] svg");
        if (target) {
          const t = target.getBoundingClientRect();
          const m = tile.getBoundingClientRect();
          const g = group.getBoundingClientRect();
          group.style.transformOrigin = `${m.left - g.left}px ${m.top - g.top}px`;
          await Promise.all([
            animate(group, { x: t.left - m.left, y: t.top - m.top, scale: t.width / m.width }, { duration: 0.6, ease: EASE_IN_OUT }),
            animate("[data-intro-backdrop]", { opacity: 0 }, { duration: 0.45, delay: 0.15, ease: EASE_IN_OUT }),
          ]);
        }
      } finally {
        if (!cancelled) finish();
      }
    })();

    return () => {
      cancelled = true;
      html.classList.remove("intro-playing");
    };
  }, [animate, scope]);

  if (done) return null;
  return (
    <div ref={scope} className="intro" aria-hidden="true">
      <div className="intro-backdrop" data-intro-backdrop />
      <div className="intro-group" data-intro-group>
        <svg viewBox="0 0 48 48" className="intro-tile" data-intro-tile style={{ opacity: 0 }}>
          <defs>
            <linearGradient id="intro-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7a42e6" />
              <stop offset="1" stopColor="#43208a" />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#intro-bg)" />
          <path d={Z_PATH} data-intro-z opacity={0} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1} fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d={SMILE_PATH} data-intro-smile opacity={0} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1} fill="none" stroke="#ffb547" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
        <span className="intro-word" data-intro-word>
          {SITE_NAME.split("").map((ch, i) => (
            <span key={i} data-intro-letter style={{ opacity: 0, display: "inline-block" }}>{ch}</span>
          ))}
        </span>
      </div>
    </div>
  );
}

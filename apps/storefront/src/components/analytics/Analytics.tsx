"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { analyticsConsent, setAnalyticsConsent, track } from "@/lib/analytics-client";

/** Sends a page_view on every client-side navigation. */
export function PageViewTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const last = useRef<string>("");
  useEffect(() => {
    const key = pathname + "?" + search.toString();
    if (key === last.current) return;
    last.current = key;
    track("page_view");
    if (pathname === "/search" && search.get("q")) track("search", { query: search.get("q")!.slice(0, 100) });
  }, [pathname, search]);
  return null;
}

export function ConsentBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const update = () => setShow(analyticsConsent() === "unset");
    update();
    const reopen = () => setShow(true);
    window.addEventListener("zentro:consent", update);
    window.addEventListener("zentro:consent-open", reopen);
    return () => {
      window.removeEventListener("zentro:consent", update);
      window.removeEventListener("zentro:consent-open", reopen);
    };
  }, []);
  if (!show) return null;
  return (
    <div role="dialog" aria-labelledby="consent-title" aria-describedby="consent-text" className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-xl rounded-2xl bg-white p-5 shadow-pop ring-1 ring-line lg:bottom-6">
      <h2 id="consent-title" className="font-semibold">Help us improve Zentro</h2>
      <p id="consent-text" className="mt-1 text-sm text-ink-muted">
        We’d like to use an analytics cookie to understand how visitors use the site. It stays with us — no ads, no third parties.
        Essential cookies (cart, sign-in) are always on. <Link href="/policies/privacy" className="font-semibold text-brand-700 underline">Privacy policy</Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAnalyticsConsent(true)} className="h-10 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">Allow analytics</button>
        <button type="button" onClick={() => setAnalyticsConsent(false)} className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-ink ring-1 ring-line-strong hover:bg-canvas">Essential only</button>
      </div>
    </div>
  );
}

export function CookieSettingsButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("zentro:consent-open"))} className="text-ink-muted hover:text-brand-700">
      Cookie settings
    </button>
  );
}

export function TrackProductView({ productId }: { productId: string }) {
  useEffect(() => track("product_view", { productId }), [productId]);
  return null;
}

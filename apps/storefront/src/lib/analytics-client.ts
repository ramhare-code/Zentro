"use client";

// First-party analytics. IDs are only created after the visitor consents.

export type TrackEvent = "page_view" | "product_view" | "search" | "add_to_cart" | "begin_checkout" | "purchase";
export const CONSENT_COOKIE = "zentro_consent";
const VISITOR_COOKIE = "zentro_vid";
const SESSION_KEY = "zentro_sid";
const SESSION_IDLE_MS = 30 * 60 * 1000;

function readCookie(name: string): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1];
}

function writeCookie(name: string, value: string, days: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${secure}`;
}

export function analyticsConsent(): "granted" | "denied" | "unset" {
  const v = readCookie(CONSENT_COOKIE);
  return v === "analytics" ? "granted" : v === "essential" ? "denied" : "unset";
}

export function setAnalyticsConsent(granted: boolean) {
  writeCookie(CONSENT_COOKIE, granted ? "analytics" : "essential", 365);
  if (!granted) {
    document.cookie = `${VISITOR_COOKIE}=; Max-Age=0; Path=/`;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
  window.dispatchEvent(new Event("zentro:consent"));
}

function ids(): { visitorId?: string; sessionId?: string } {
  if (analyticsConsent() !== "granted") return {};
  let visitorId = readCookie(VISITOR_COOKIE);
  if (!visitorId || !/^[0-9a-f-]{36}$/.test(visitorId)) {
    visitorId = crypto.randomUUID();
  }
  writeCookie(VISITOR_COOKIE, visitorId, 395); // refresh, ~13 months
  let sessionId: string | undefined;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const [id, last] = raw ? raw.split("|") : [];
    sessionId = id && last && Date.now() - Number(last) < SESSION_IDLE_MS ? id : crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, `${sessionId}|${Date.now()}`);
  } catch {
    sessionId = crypto.randomUUID();
  }
  return { visitorId, sessionId };
}

export function track(event: TrackEvent, data: { productId?: string; query?: string; valuePaise?: number } = {}) {
  try {
    const body = JSON.stringify({
      event,
      path: location.pathname + location.search,
      referrer: document.referrer || undefined,
      ...ids(),
      ...data,
    });
    if (!navigator.sendBeacon?.("/api/t", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/t", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
    }
  } catch {
    /* analytics must never break the page */
  }
}

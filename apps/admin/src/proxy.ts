import { NextResponse, type NextRequest } from "next/server";
import { adminCsp } from "./lib/csp";

const origin = (u?: string) => { try { return u ? new URL(u).origin : undefined; } catch { return undefined; } };

/** Every response gets a CSP with a fresh nonce; Next applies it to its own scripts. */
function withCsp(req: NextRequest, res?: NextResponse) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = adminCsp(nonce, { dev: process.env.NODE_ENV === "development", storefront: origin(process.env.STOREFRONT_URL), supabase: origin(process.env.NEXT_PUBLIC_SUPABASE_URL) });
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const out = res ?? NextResponse.next({ request: { headers } });
  out.headers.set("content-security-policy", csp);
  return out;
}

// Optimistic gate only: sends signed-out visitors to /login quickly.
// Real authorisation happens on the server in every page and action
// (requirePermission / authorize), which validates the session in the DB.
const PUBLIC = [/^\/login(\/|$)/, /^\/invite\//, /^\/api\/health$/];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return withCsp(req);
  const hasCookie = req.cookies.has("__Host-zentro_admin") || req.cookies.has("zentro_admin");
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return withCsp(req, NextResponse.redirect(url));
  }
  return withCsp(req);
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};

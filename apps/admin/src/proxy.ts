import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: sends signed-out visitors to /login quickly.
// Real authorisation happens on the server in every page and action
// (requirePermission / authorize), which validates the session in the DB.
const PUBLIC = [/^\/login(\/|$)/, /^\/invite\//];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const hasCookie = req.cookies.has("__Host-zentro_admin") || req.cookies.has("zentro_admin");
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

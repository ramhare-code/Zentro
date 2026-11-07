/** Strict Content-Security-Policy for the admin: scripts only with this request's nonce. */
export function adminCsp(nonce: string, opts: { dev: boolean; storefront?: string; supabase?: string }) {
  const img = ["'self'", "data:", "blob:", "https://images.unsplash.com", opts.storefront, opts.supabase].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // inline style attributes (charts, progress bars)
    `img-src ${img}`,
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    ...(opts.dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

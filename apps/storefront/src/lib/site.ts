export const SITE_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME || "Zentro";

export function siteUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return base + (path.startsWith("/") ? path : `/${path}`);
}

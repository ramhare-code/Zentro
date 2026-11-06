import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Staging/preview deployments must never be indexed.
  if (process.env.APP_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/cart", "/checkout", "/search"] },
    sitemap: siteUrl("/sitemap.xml"),
  };
}

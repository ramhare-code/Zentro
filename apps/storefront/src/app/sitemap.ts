import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/catalog";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { renderAtRequestIfConfigured } from "@/lib/render";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await renderAtRequestIfConfigured();
  const { products, categories } = await getSitemapEntries();
  const pages = await db()<{ path: string; at: Date }[]>`
    select case when kind = 'policy' then '/policies/' else '/pages/' end || slug as path, published_at as at
    from shop.content_pages where published_version_id is not null`;
  return [
    { url: siteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/categories"), changeFrequency: "weekly", priority: 0.6 },
    ...categories.map((c) => ({ url: siteUrl(`/c/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...pages.map((p) => ({ url: siteUrl(p.path), lastModified: p.at, changeFrequency: "monthly" as const, priority: 0.3 })),
    ...products.map((p) => ({ url: siteUrl(`/p/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}

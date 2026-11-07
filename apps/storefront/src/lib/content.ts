import "server-only";
import { cache } from "react";
import type { Placeholder } from "@zentro/commerce/content";
import { db } from "./db";
import { businessInfo } from "./env";

export interface PublishedPage { slug: string; kind: "policy" | "page"; title: string; summary: string | null; body: string; seoTitle: string | null; seoDescription: string | null; publishedAt: Date }

export const getPublishedPage = cache(async (kind: "policy" | "page", slug: string): Promise<PublishedPage | null> => {
  const [p] = await db()<PublishedPage[]>`
    select p.slug, p.kind, v.title, v.summary, v.body, p.seo_title as "seoTitle", p.seo_description as "seoDescription", p.published_at as "publishedAt"
    from shop.content_pages p join shop.content_page_versions v on v.id = p.published_version_id
    where p.kind = ${kind} and p.slug = ${slug}`;
  return p ?? null;
});

export const getFooterPages = cache(async () => db()<{ slug: string; kind: "policy" | "page"; title: string }[]>`
  select p.slug, p.kind, v.title from shop.content_pages p join shop.content_page_versions v on v.id = p.published_version_id
  where p.show_in_footer order by p.kind, p.sort_order, v.title`);

export function placeholderValues(): Partial<Record<Placeholder, string | undefined>> {
  const b = businessInfo();
  return { business: b.legalName || b.name, email: b.supportEmail, phone: b.supportPhone, address: b.address, gstin: b.gstin, returnDays: String(Number(process.env.RETURN_WINDOW_DAYS) || 7) };
}

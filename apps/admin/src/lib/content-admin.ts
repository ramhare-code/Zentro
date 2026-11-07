import "server-only";
import type { Placeholder } from "@zentro/commerce/content";
import { db } from "./db";

export function placeholderValues(): Partial<Record<Placeholder, string | undefined>> {
  const e = process.env;
  return { business: e.BUSINESS_LEGAL_NAME || e.NEXT_PUBLIC_BUSINESS_NAME || "Zentro", email: e.SUPPORT_EMAIL || undefined, phone: e.SUPPORT_PHONE || undefined,
    address: e.BUSINESS_ADDRESS || undefined, gstin: e.BUSINESS_GSTIN || undefined, returnDays: String(Number(e.RETURN_WINDOW_DAYS) || 7) };
}

export interface PageRow {
  id: string; slug: string; kind: "policy" | "page"; showInFooter: boolean; sortOrder: number; needsReview: boolean; seoTitle: string | null; seoDescription: string | null;
  publishedAt: Date | null; draftVersion: number | null; publishedVersion: number | null; title: string; summary: string | null; body: string; updatedAt: Date; updatedBy: string | null;
}

export async function listPages() {
  return db()<PageRow[]>`
    select p.id, p.slug, p.kind, p.show_in_footer as "showInFooter", p.sort_order as "sortOrder", p.needs_review as "needsReview",
           p.seo_title as "seoTitle", p.seo_description as "seoDescription", p.published_at as "publishedAt",
           d.version as "draftVersion", pv.version as "publishedVersion", d.title, d.summary, d.body, d.created_at as "updatedAt", u.full_name as "updatedBy"
    from shop.content_pages p join shop.content_page_versions d on d.id = p.draft_version_id
    left join shop.content_page_versions pv on pv.id = p.published_version_id left join shop.staff_users u on u.id = d.created_by
    order by p.kind desc, p.sort_order, d.title`;
}

export async function getPage(id: string) {
  const sql = db();
  const [p] = await sql<PageRow[]>`
    select p.id, p.slug, p.kind, p.show_in_footer as "showInFooter", p.sort_order as "sortOrder", p.needs_review as "needsReview",
           p.seo_title as "seoTitle", p.seo_description as "seoDescription", p.published_at as "publishedAt",
           d.version as "draftVersion", pv.version as "publishedVersion", d.title, d.summary, d.body, d.created_at as "updatedAt", u.full_name as "updatedBy"
    from shop.content_pages p join shop.content_page_versions d on d.id = p.draft_version_id
    left join shop.content_page_versions pv on pv.id = p.published_version_id left join shop.staff_users u on u.id = d.created_by
    where p.id = ${id}`;
  if (!p) return null;
  const versions = await sql<{ id: string; version: number; title: string; note: string | null; createdAt: Date; by: string | null; chars: number }[]>`
    select v.id, v.version, v.title, v.note, v.created_at as "createdAt", u.full_name as by, char_length(v.body) as chars
    from shop.content_page_versions v left join shop.staff_users u on u.id = v.created_by where v.page_id = ${id} order by v.version desc limit 50`;
  return { ...p, versions };
}

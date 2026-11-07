"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "../audit";
import { revalidateWholeStorefront } from "../catalog-admin";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const str = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);

/** Saves the editor as a new draft version (every save is kept). Creates the page on first save. */
export async function savePageAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().safeParse(f.get("pageId")).data ?? null;
    const title = str(f, "title", 100), summary = str(f, "summary", 300) || null, body = str(f, "body", 60000), note = str(f, "note", 200) || null;
    if (title.length < 2) throw new UserError("Enter a title.");
    if (body.length < 20) throw new UserError("The page needs some content (at least a sentence).");
    const meta = {
      seo_title: str(f, "seoTitle", 70) || null, seo_description: str(f, "seoDescription", 170) || null,
      show_in_footer: f.get("showInFooter") === "on", sort_order: z.coerce.number().int().min(0).max(1000).catch(0).parse(f.get("sortOrder") || 0),
    };
    const sql = db();
    const pageId = await sql.begin(async (tx) => {
      let pid = id;
      if (!pid) {
        const slug = str(f, "slug", 60).toLowerCase();
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new UserError("The address must be lowercase letters, numbers and hyphens, e.g. about-us.");
        const kind = f.get("kind") === "policy" ? "policy" : "page";
        const [dupe] = await tx`select 1 from shop.content_pages where slug = ${slug}`;
        if (dupe) throw new UserError("A page with that address already exists.");
        pid = (await tx<{ id: string }[]>`insert into shop.content_pages ${tx({ slug, kind, ...meta })} returning id`)[0]!.id;
      } else {
        const [p] = await tx`select 1 from shop.content_pages where id = ${pid} for update`;
        if (!p) throw new UserError("Page not found.");
        await tx`update shop.content_pages set ${tx(meta)} where id = ${pid}`;
      }
      const [latest] = await tx<{ title: string; summary: string | null; body: string; n: number }[]>`
        select v.title, v.summary, v.body, v.version as n from shop.content_page_versions v where v.page_id = ${pid} order by v.version desc limit 1`;
      if (latest && latest.title === title && latest.summary === summary && latest.body === body) return pid; // nothing changed in the text
      const [v] = await tx<{ id: string; version: number }[]>`
        insert into shop.content_page_versions (page_id, version, title, summary, body, note, created_by)
        values (${pid}, ${(latest?.n ?? 0) + 1}, ${title}, ${summary}, ${body}, ${note}, ${s.staffId}) returning id, version`;
      await tx`update shop.content_pages set draft_version_id = ${v!.id} where id = ${pid}`;
      await audit(s, { action: id ? "content.save" : "content.create", entityType: "content_page", entityId: pid, details: { version: v!.version, title } }, tx);
      return pid;
    });
    if (!id) redirect(`/content/${pageId}?created=1`);
    revalidatePath(`/content/${pageId}`);
    return { ok: true, message: "Draft saved. Publish it to show it on the store." };
  });
}

/** Publishes the latest draft, or takes the page off the store. Policies need a fresh sign-in. */
export async function publishPageAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const id = z.guid().parse(f.get("pageId"));
    const op = f.get("op") === "unpublish" ? "unpublish" : "publish";
    const sql = db();
    const [p] = await sql<{ kind: string; slug: string; draft: string | null; published: string | null; needsReview: boolean }[]>`
      select kind, slug, draft_version_id as draft, published_version_id as published, needs_review as "needsReview" from shop.content_pages where id = ${id}`;
    if (!p) throw new UserError("Page not found.");
    // legal pages are binding on customers: confirm identity before changing them
    const s = await authorize("marketing.manage", p.kind === "policy" ? { recentAuth: true } : undefined);
    let message: string;
    if (op === "unpublish") {
      if (p.kind === "policy") throw new UserError("Policies can’t be taken down — customers and payment providers rely on them. Publish a corrected version instead.");
      await sql`update shop.content_pages set published_version_id = null, published_at = null where id = ${id}`;
      message = "Taken off the store.";
    } else {
      if (!p.draft) throw new UserError("Save a draft first.");
      const reviewed = f.get("reviewed") === "on";
      if (p.draft === p.published && !(p.needsReview && reviewed)) throw new UserError("This version is already live.");
      await sql`update shop.content_pages set published_version_id = draft_version_id, published_at = now(), needs_review = ${p.needsReview && !reviewed} where id = ${id}`;
      message = `Published. ${p.kind === "policy" ? `/policies/${p.slug}` : `/pages/${p.slug}`} shows this version within a few minutes.`;
    }
    const [v] = await sql<{ version: number }[]>`select version from shop.content_page_versions where id = ${p.draft}`;
    await audit(s, { action: `content.${op}`, entityType: "content_page", entityId: id, details: { slug: p.slug, version: v?.version, reviewed: f.get("reviewed") === "on" } });
    await revalidateWholeStorefront(); // footer links appear on every page
    revalidatePath(`/content/${id}`);
    revalidatePath("/content");
    return { ok: true, message };
  });
}

/** Copies an old version into a new draft (history is never rewritten). */
export async function restoreVersionAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const versionId = z.guid().parse(f.get("versionId"));
    const sql = db();
    const pid = await sql.begin(async (tx) => {
      const [old] = await tx<{ pageId: string; version: number; title: string; summary: string | null; body: string }[]>`
        select page_id as "pageId", version, title, summary, body from shop.content_page_versions where id = ${versionId}`;
      if (!old) throw new UserError("Version not found.");
      await tx`select 1 from shop.content_pages where id = ${old.pageId} for update`; // serialise version numbers
      const [row] = await tx<{ n: number }[]>`select max(version)::int as n from shop.content_page_versions where page_id = ${old.pageId}`;
      const n = row!.n;
      const [v] = await tx<{ id: string }[]>`
        insert into shop.content_page_versions (page_id, version, title, summary, body, note, created_by)
        values (${old.pageId}, ${n + 1}, ${old.title}, ${old.summary}, ${old.body}, ${`Restored from version ${old.version}`}, ${s.staffId}) returning id`;
      await tx`update shop.content_pages set draft_version_id = ${v!.id} where id = ${old.pageId}`;
      await audit(s, { action: "content.restore", entityType: "content_page", entityId: old.pageId, details: { from: old.version, to: n + 1 } }, tx);
      return old.pageId;
    });
    revalidatePath(`/content/${pid}`);
    return { ok: true, message: "Copied into a new draft. Review it, then publish." };
  });
}

export async function deletePageAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage", { recentAuth: true });
    const id = z.guid().parse(f.get("pageId"));
    const sql = db();
    const [p] = await sql<{ kind: string; slug: string }[]>`select kind, slug from shop.content_pages where id = ${id}`;
    if (!p) throw new UserError("Page not found.");
    if (p.kind === "policy") throw new UserError("Policies can’t be deleted.");
    await sql.begin(async (tx) => {
      await tx`update shop.content_pages set draft_version_id = null, published_version_id = null where id = ${id}`;
      await tx`delete from shop.content_pages where id = ${id}`;
      await audit(s, { action: "content.delete", entityType: "content_page", entityId: id, details: { slug: p.slug } }, tx);
    });
    await revalidateWholeStorefront();
    redirect("/content?deleted=1");
  });
}

// ------------------------------------------------------------------ FAQs

export async function saveFaqAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().safeParse(f.get("faqId")).data ?? null;
    const row = {
      topic: str(f, "topic", 60), question: str(f, "question", 200), answer: str(f, "answer", 4000),
      sort_order: z.coerce.number().int().min(0).max(1000).catch(0).parse(f.get("sortOrder") || 0),
      is_active: f.get("isActive") === "on", updated_by: s.staffId,
    };
    if (row.topic.length < 2) throw new UserError("Choose or type a topic, e.g. Orders.");
    if (row.question.length < 5) throw new UserError("Write the question.");
    if (row.answer.length < 2) throw new UserError("Write the answer.");
    const sql = db();
    const saved = id
      ? (await sql<{ id: string }[]>`update shop.faqs set ${sql(row)} where id = ${id} returning id`)[0]?.id
      : (await sql<{ id: string }[]>`insert into shop.faqs ${sql(row)} returning id`)[0]!.id;
    if (!saved) throw new UserError("FAQ not found.");
    await audit(s, { action: id ? "faq.update" : "faq.create", entityType: "faq", entityId: saved, details: { topic: row.topic, question: row.question } });
    await revalidateWholeStorefront();
    revalidatePath("/content/faqs");
    return { ok: true, message: id ? "Saved." : "Added to the help centre." };
  });
}

export async function deleteFaqAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("marketing.manage");
    const id = z.guid().parse(f.get("faqId"));
    const [q] = await db()<{ question: string }[]>`delete from shop.faqs where id = ${id} returning question`;
    if (!q) throw new UserError("FAQ not found.");
    await audit(s, { action: "faq.delete", entityType: "faq", entityId: id, details: { question: q.question } });
    await revalidateWholeStorefront();
    revalidatePath("/content/faqs");
    return { ok: true, message: "Deleted." };
  });
}

import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ContentEditor } from "@/components/content/ContentEditor";
import { PageMetaFields } from "@/components/content/PageMetaFields";
import { deletePageAction, publishPageAction, restoreVersionAction, savePageAction } from "@/lib/actions/content";
import { getPage, placeholderValues } from "@/lib/content-admin";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Edit page" };

export default async function EditContentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePermission("marketing.manage");
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const p = await getPage(id);
  if (!p) notFound();
  const pending = p.publishedVersion !== p.draftVersion;
  const storeUrl = `${(process.env.STOREFRONT_URL ?? "").replace(/\/$/, "")}/${p.kind === "policy" ? "policies" : "pages"}/${p.slug}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{p.title}</h1>
        {p.publishedVersion !== null && <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">View on store</a>}
      </div>
      {(await searchParams).created === "1" && <p role="status" className="rounded-xl bg-good-50 px-4 py-3 text-sm text-good-700">Draft saved. Publish it when it’s ready.</p>}

      <ActionForm action={publishPageAction} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
        <input type="hidden" name="pageId" value={p.id} />
        <p className="flex-1">
          {p.publishedVersion === null ? <>Not on the store. Draft is version {p.draftVersion}.</>
            : pending ? <>Live: version {p.publishedVersion}. <strong>Draft version {p.draftVersion} isn’t published yet.</strong></>
            : <>Live: version {p.publishedVersion}, published {formatDateTime(p.publishedAt)}.</>}
          {p.kind === "policy" && <span className="block text-xs text-ink-muted">Publishing a policy asks you to confirm it’s you.</span>}
        </p>
        {p.needsReview && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reviewed" className="size-4" /> A legal adviser has reviewed this text</label>}
        {(pending || p.needsReview || p.publishedVersion === null) && <SubmitButton name="op" value="publish" confirm={p.kind === "policy" ? "Publish this policy? Customers are bound by what it says." : undefined}>Publish version {p.draftVersion}</SubmitButton>}
        {p.kind === "page" && p.publishedVersion !== null && <SubmitButton name="op" value="unpublish" variant="secondary">Take off store</SubmitButton>}
      </ActionForm>
      {p.needsReview && <p className="card border-l-4 border-warn-500 p-4 text-sm">This is starter text that came with Zentro. It must be checked against how your business actually works (return window, delivery areas, data you collect) before launch.</p>}

      <ActionForm action={savePageAction} className="card space-y-4 p-5">
        <PageMetaFields p={p} />
        <ContentEditor initial={p.body} values={placeholderValues()} />
        <SubmitButton>Save draft</SubmitButton>
      </ActionForm>

      <section aria-labelledby="history" className="card p-5">
        <h2 id="history" className="font-semibold">Version history</h2>
        <ActionForm action={restoreVersionAction} className="mt-2">
          <ul className="divide-y divide-line text-sm">
            {p.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-semibold">Version {v.version}</span>{v.version === p.publishedVersion && <span className="ml-2 rounded-full bg-good-50 px-2 py-0.5 text-xs font-semibold text-good-700">Live</span>}{v.version === p.draftVersion && v.version !== p.publishedVersion && <span className="ml-2 rounded-full bg-info-50 px-2 py-0.5 text-xs font-semibold text-info-700">Draft</span>}
                  <span className="block text-xs text-ink-muted">{formatDateTime(v.createdAt)}{v.by && ` · ${v.by}`}{v.note && ` · ${v.note}`} · {v.chars.toLocaleString("en-IN")} characters</span></span>
                {v.version !== p.draftVersion && <SubmitButton name="versionId" value={v.id} variant="secondary" className="h-8 px-3">Restore as draft</SubmitButton>}
              </li>
            ))}
          </ul>
        </ActionForm>
      </section>

      {p.kind === "page" && (
        <ActionForm action={deletePageAction} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
          <input type="hidden" name="pageId" value={p.id} />
          <p className="flex-1 text-ink-muted">Delete this page and all its versions.</p>
          <SubmitButton variant="danger" confirm="Delete this page and its history?">Delete page</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

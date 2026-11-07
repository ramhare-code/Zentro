import type { PageRow } from "@/lib/content-admin";

export function PageMetaFields({ p }: { p?: PageRow }) {
  return (
    <div className="space-y-3">
      {p && <input type="hidden" name="pageId" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Title<input name="title" required maxLength={100} defaultValue={p?.title} className="input mt-1.5" /></label>
        {!p ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <label className="text-sm font-medium">Type<select name="kind" className="input mt-1.5"><option value="page">Page</option><option value="policy">Policy</option></select></label>
            <label className="text-sm font-medium">Address<input name="slug" required maxLength={60} placeholder="about-us" className="input mt-1.5 font-mono text-sm" /></label>
          </div>
        ) : (
          <p className="text-sm"><span className="font-medium">Address</span><code className="mt-2.5 block text-ink-muted">{p.kind === "policy" ? "/policies/" : "/pages/"}{p.slug}</code></p>
        )}
      </div>
      <label className="block text-sm font-medium">Summary <span className="font-normal text-ink-muted">(shown under the title)</span><input name="summary" maxLength={300} defaultValue={p?.summary ?? ""} className="input mt-1.5" /></label>
      <details className="rounded-xl p-3 ring-1 ring-line">
        <summary className="cursor-pointer text-sm font-semibold">Search & footer</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">SEO title<input name="seoTitle" maxLength={70} defaultValue={p?.seoTitle ?? ""} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">SEO description<input name="seoDescription" maxLength={170} defaultValue={p?.seoDescription ?? ""} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Footer order<input name="sortOrder" inputMode="numeric" defaultValue={p?.sortOrder ?? 0} className="input mt-1.5" /></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="showInFooter" defaultChecked={p?.showInFooter ?? true} className="size-4" /> Link from the footer</label>
        </div>
      </details>
      <label className="block text-sm font-medium">Note for history <span className="font-normal text-ink-muted">(optional, e.g. “Updated return window”)</span><input name="note" maxLength={200} className="input mt-1.5" /></label>
    </div>
  );
}

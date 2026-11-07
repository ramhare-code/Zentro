import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { categoryOpAction, saveCategoryAction } from "@/lib/actions/taxonomy";
import { db } from "@/lib/db";
import { mediaSrc } from "@/lib/media";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Categories" };

type Cat = { id: string; parentId: string | null; name: string; slug: string; description: string | null; imageUrl: string | null; sortOrder: number; isActive: boolean; publishAt: Date | null; seoTitle: string | null; seoDescription: string | null; noindex: boolean; products: number; live: boolean };

function istLocal(d: Date | null) {
  if (!d) return "";
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);
}

function CategoryForm({ c, all }: { c?: Cat; all: Cat[] }) {
  const label = (x: Cat): string => { const p = all.find((y) => y.id === x.parentId); return p ? `${label(p)} › ${x.name}` : x.name; };
  return (
    <ActionForm action={saveCategoryAction} className="grid gap-3 md:grid-cols-3">
      {c && <input type="hidden" name="categoryId" value={c.id} />}
      <label className="text-sm font-medium">Name<input name="name" required maxLength={80} defaultValue={c?.name} className="input mt-1 h-10" /></label>
      <label className="text-sm font-medium">URL slug<input name="slug" maxLength={80} defaultValue={c?.slug} className="input mt-1 h-10 font-mono text-sm" /></label>
      <label className="text-sm font-medium">Parent<select name="parentId" defaultValue={c?.parentId ?? ""} className="input mt-1 h-10"><option value="">— Top level —</option>{all.filter((x) => x.id !== c?.id).map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select></label>
      <label className="text-sm font-medium md:col-span-2">Description<input name="description" maxLength={500} defaultValue={c?.description ?? ""} className="input mt-1 h-10" /></label>
      <label className="text-sm font-medium">Sort order<input name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 0} className="input mt-1 h-10" /></label>
      <label className="text-sm font-medium">Image upload<input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp,image/avif" className="mt-1 block w-full text-sm" /></label>
      <label className="text-sm font-medium">…or image link<input name="imageUrl" type="url" placeholder="https://" className="input mt-1 h-10" /></label>
      <label className="text-sm font-medium">Visible from (IST, optional)<input name="publishAt" type="datetime-local" defaultValue={istLocal(c?.publishAt ?? null)} className="input mt-1 h-10" /></label>
      <label className="text-sm font-medium">SEO title<input name="seoTitle" maxLength={70} defaultValue={c?.seoTitle ?? ""} className="input mt-1 h-10" /></label>
      <label className="text-sm font-medium md:col-span-2">SEO description<input name="seoDescription" maxLength={170} defaultValue={c?.seoDescription ?? ""} className="input mt-1 h-10" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} className="size-4 accent-brand-600" />Visible on the shop</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={c?.noindex} className="size-4 accent-brand-600" />Hide from search engines</label>
      <div className="md:col-span-3"><SubmitButton variant="secondary">{c ? "Save category" : "Create category"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function CategoriesPage() {
  await requirePermission("catalog.manage");
  const all = await db()<Cat[]>`
    select c.id, c.parent_id as "parentId", c.name, c.slug, c.description, c.image_url as "imageUrl", c.sort_order as "sortOrder", c.is_active as "isActive",
           c.publish_at as "publishAt", c.seo_title as "seoTitle", c.seo_description as "seoDescription", c.noindex,
           (select count(*)::int from shop.products p where p.category_id = c.id and p.archived_at is null) as products,
           shop.category_live(c.is_active, c.publish_at) as live
    from shop.categories c order by c.sort_order, c.name`;
  const render = (parentId: string | null, depth: number): React.ReactNode => {
    const kids = all.filter((c) => c.parentId === parentId);
    if (!kids.length) return null;
    return (
      <ul className={depth ? "ml-6 mt-2 space-y-2 border-l border-line pl-4" : "space-y-3"}>
        {kids.map((c, i) => (
          <li key={c.id} aria-label={`Category ${c.name}`}>
            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  {c.imageUrl ? <img src={mediaSrc(c.imageUrl)} alt="" className="size-10 rounded-lg object-cover" /> : <span className="size-10 rounded-lg bg-canvas" />}
                  <span><span className="font-semibold">{c.name}</span> <span className="font-mono text-xs text-ink-muted">/c/{c.slug}</span>
                    <span className="block text-xs text-ink-muted">{c.products} product(s) · {c.live ? "visible" : c.isActive ? "scheduled" : "hidden"}{c.noindex && " · noindex"}</span></span>
                </span>
                <ActionForm action={categoryOpAction} className="flex gap-1">
                  <input type="hidden" name="categoryId" value={c.id} />
                  {i > 0 && <SubmitButton name="op" value="up" variant="secondary" className="h-8 px-2 text-xs" label={`Move ${c.name} up`}>↑</SubmitButton>}
                  {i < kids.length - 1 && <SubmitButton name="op" value="down" variant="secondary" className="h-8 px-2 text-xs" label={`Move ${c.name} down`}>↓</SubmitButton>}
                  <SubmitButton name="op" value="delete" variant="secondary" className="h-8 px-2 text-xs text-bad-700" confirm={`Delete “${c.name}”?`}>Delete</SubmitButton>
                </ActionForm>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-brand-700">Edit {c.name}</summary>
                <div className="mt-4 border-t border-line pt-4"><CategoryForm c={c} all={all} /></div>
              </details>
            </div>
            {render(c.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Categories</h1><p className="mt-1 text-sm text-ink-muted">Up to three levels. Hiding a category hides its products from the shop until it’s visible again.</p></div>
      {render(null, 0)}
      <section className="card p-5"><h2 className="mb-4 font-semibold">New category</h2><CategoryForm all={all} /></section>
    </div>
  );
}

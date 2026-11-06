import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { deleteBrandAction, saveBrandAction } from "@/lib/actions/taxonomy";
import { db } from "@/lib/db";
import { mediaSrc } from "@/lib/media";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Brands" };

type Brand = { id: string; name: string; slug: string; logoUrl: string | null; isActive: boolean; products: number };

function BrandForm({ b }: { b?: Brand }) {
  return (
    <ActionForm action={saveBrandAction} className="grid gap-3 md:grid-cols-4">
      {b && <input type="hidden" name="brandId" value={b.id} />}
      <label className="text-sm font-medium">Name<input name="name" required maxLength={80} defaultValue={b?.name} className="input mt-1 h-10" /></label>
      <label className="text-sm font-medium">Slug<input name="slug" maxLength={80} defaultValue={b?.slug} className="input mt-1 h-10 font-mono text-sm" /></label>
      <label className="text-sm font-medium">Logo upload<input type="file" name="logoFile" accept="image/jpeg,image/png,image/webp,image/avif" className="mt-1 block w-full text-sm" /></label>
      <label className="text-sm font-medium">…or logo link<input name="logoUrl" type="url" placeholder="https://" className="input mt-1 h-10" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={b?.isActive ?? true} className="size-4 accent-brand-600" />Active (can be assigned to products)</label>
      <div className="md:col-span-3"><SubmitButton variant="secondary">{b ? "Save brand" : "Add brand"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function BrandsPage() {
  await requirePermission("catalog.manage");
  const brands = await db()<Brand[]>`
    select b.id, b.name, b.slug, b.logo_url as "logoUrl", b.is_active as "isActive", (select count(*)::int from shop.products p where p.brand_id = b.id) as products
    from shop.brands b order by b.is_active desc, b.name`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
      <ul className="space-y-3">
        {brands.map((b) => (
          <li key={b.id} aria-label={`Brand ${b.name}`}>
            <details className="card p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  {b.logoUrl ? <img src={mediaSrc(b.logoUrl)} alt="" className="size-10 rounded-lg object-contain" /> : <span className="grid size-10 place-items-center rounded-lg bg-canvas text-sm font-bold">{b.name.slice(0, 1)}</span>}
                  <span><span className="font-semibold">{b.name}</span><span className="block text-xs text-ink-muted">{b.products} product(s){b.isActive ? "" : " · archived"}</span></span>
                </span>
                {b.products === 0 && (
                  <ActionForm action={deleteBrandAction}><input type="hidden" name="brandId" value={b.id} /><SubmitButton variant="secondary" className="h-8 px-2 text-xs text-bad-700" confirm={`Delete ${b.name}?`}>Delete</SubmitButton></ActionForm>
                )}
              </summary>
              <div className="mt-4 border-t border-line pt-4"><BrandForm b={b} /></div>
            </details>
          </li>
        ))}
      </ul>
      <section className="card p-5"><h2 className="mb-4 font-semibold">New brand</h2><BrandForm /></section>
    </div>
  );
}

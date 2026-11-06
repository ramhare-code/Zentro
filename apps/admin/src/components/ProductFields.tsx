import { GST_RATES, specsToText, type ProductForEdit } from "@/lib/catalog-admin";

type Opts = { categories: { id: string; label: string; isActive: boolean }[]; brands: { id: string; name: string; isActive: boolean }[] };

export function ProductFields({ p, opts }: { p?: ProductForEdit; opts: Opts }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">Product name<input name="name" required maxLength={200} defaultValue={p?.name} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">URL slug <span className="font-normal text-ink-muted">(blank = from name)</span><input name="slug" maxLength={80} defaultValue={p?.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input mt-1.5 font-mono text-sm" /></label>
        <label className="text-sm font-medium">Category<select name="categoryId" required defaultValue={p?.categoryId ?? ""} className="input mt-1.5"><option value="" disabled>Choose…</option>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.label}{c.isActive ? "" : " (hidden)"}</option>)}</select></label>
        <label className="text-sm font-medium">Brand<select name="brandId" defaultValue={p?.brandId ?? ""} className="input mt-1.5"><option value="">No brand</option>{opts.brands.filter((b) => b.isActive || b.id === p?.brandId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </div>
      <label className="block text-sm font-medium">Short description <span className="font-normal text-ink-muted">(shown on cards and at the top of the page)</span><input name="shortDescription" maxLength={300} defaultValue={p?.shortDescription ?? ""} className="input mt-1.5" /></label>
      <label className="block text-sm font-medium">Full description<textarea name="description" rows={5} maxLength={10000} defaultValue={p?.description ?? ""} className="input mt-1.5 h-auto py-2" /></label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">Highlights <span className="font-normal text-ink-muted">(one per line)</span><textarea name="highlights" rows={5} defaultValue={p?.highlights.join("\n")} className="input mt-1.5 h-auto py-2" /></label>
        <label className="text-sm font-medium">Specifications <span className="font-normal text-ink-muted">(“Label: Value” or “Group | Label | Value”)</span><textarea name="specifications" rows={5} defaultValue={p ? specsToText(p.specifications) : ""} placeholder={"Material: Aluminium\nBattery | Life | 20 hours"} className="input mt-1.5 h-auto py-2 font-mono text-sm" /></label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium">HSN code<input name="hsnCode" inputMode="numeric" maxLength={8} defaultValue={p?.hsnCode ?? ""} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">GST rate<select name="gstRate" defaultValue={p ? String(Number(p.gstRate)) : "18"} className="input mt-1.5">{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium"><input type="checkbox" name="isFeatured" defaultChecked={p?.isFeatured} className="size-4 accent-brand-600" />Feature on the homepage</label>
      </div>
      <details className="rounded-xl bg-canvas p-4">
        <summary className="cursor-pointer text-sm font-semibold">Search engine listing (SEO)</summary>
        <div className="mt-3 grid gap-3">
          <label className="text-sm font-medium">Page title <span className="font-normal text-ink-muted">(≤ 70, blank = product name)</span><input name="seoTitle" maxLength={70} defaultValue={p?.seoTitle ?? ""} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Meta description <span className="font-normal text-ink-muted">(≤ 170)</span><textarea name="seoDescription" maxLength={170} rows={2} defaultValue={p?.seoDescription ?? ""} className="input mt-1.5 h-auto py-2" /></label>
        </div>
      </details>
    </div>
  );
}

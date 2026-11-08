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
      <fieldset className="rounded-xl bg-canvas p-4">
        <legend className="px-1 text-sm font-semibold">Product information <span className="font-normal text-ink-muted">(shown in the details table; leave blank to hide)</span></legend>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">What’s in the box <span className="font-normal text-ink-muted">(one item per line)</span><textarea name="boxContents" rows={4} defaultValue={p?.boxContents.join("\n")} placeholder={"Headphones\nUSB-C charging cable\nCarry pouch"} className="input mt-1.5 h-auto py-2" /></label>
          <label className="text-sm font-medium">Care instructions<textarea name="careInstructions" rows={4} maxLength={1000} defaultValue={p?.careInstructions ?? ""} className="input mt-1.5 h-auto py-2" /></label>
          <label className="text-sm font-medium">Warranty<input name="warranty" maxLength={500} defaultValue={p?.warranty ?? ""} placeholder="1 year manufacturer warranty" className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Country of origin<input name="countryOfOrigin" maxLength={60} defaultValue={p?.countryOfOrigin ?? ""} placeholder="India" className="input mt-1.5" /></label>
        </div>
        <label className="mt-3 block text-sm font-medium">Manufacturer, packer & importer details <span className="font-normal text-ink-muted">(name and address — required by Indian packaging rules)</span><textarea name="manufacturerInfo" rows={3} maxLength={1000} defaultValue={p?.manufacturerInfo ?? ""} className="input mt-1.5 h-auto py-2" /></label>
      </fieldset>
      <StoryFields p={p} />
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

/** "From the brand" sections: picture or video beside text, alternating sides on the product page. */
function StoryFields({ p }: { p?: ProductForEdit }) {
  const existing = p?.brandStory ?? [];
  const rows = Math.min(8, existing.length + 2);
  const images = p?.media.filter((m) => m.kind === "image") ?? [];
  return (
    <fieldset className="rounded-xl bg-canvas p-4">
      <legend className="px-1 text-sm font-semibold">From the brand <span className="font-normal text-ink-muted">(optional — up to 8 sections; a picture or video sits beside the text)</span></legend>
      <p className="mt-1 text-xs text-ink-muted">Text can use <strong>**bold**</strong> and lines starting with “- ” for bullets. For media, paste a YouTube link or an https .mp4/.webm link, or pick one of this product’s images. Save, then reload to get more empty sections.</p>
      <ol className="mt-3 space-y-3">
        {Array.from({ length: rows }, (_, i) => {
          const sec = existing[i];
          const picked = sec?.mediaUrl && images.some((m) => m.url === sec.mediaUrl) ? sec.mediaUrl : "";
          return (
            <li key={i} className="rounded-lg bg-white p-3 ring-1 ring-line">
              <p className="text-xs font-semibold text-ink-muted">Section {i + 1}</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium">Heading<input name="storyTitle" maxLength={120} defaultValue={sec?.title ?? ""} className="input mt-1.5" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">Video or image link<input name="storyMedia" type="url" maxLength={1000} defaultValue={picked ? "" : (sec?.mediaUrl ?? "")} placeholder="https://youtu.be/…" className="input mt-1.5" /></label>
                  <label className="text-sm font-medium">…or product image<select name="storyPick" defaultValue={picked} className="input mt-1.5"><option value="">None</option>{images.map((m, j) => <option key={m.id} value={m.url}>Image {j + 1}{m.alt ? ` — ${m.alt.slice(0, 30)}` : ""}</option>)}</select></label>
                </div>
              </div>
              <label className="mt-3 block text-sm font-medium">Text<textarea name="storyBody" rows={3} maxLength={2000} defaultValue={sec?.body ?? ""} className="input mt-1.5 h-auto py-2" /></label>
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}

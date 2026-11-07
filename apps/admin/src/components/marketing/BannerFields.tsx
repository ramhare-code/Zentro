import { istLocal } from "@/lib/ist";
import { mediaSrc } from "@/lib/media";

export interface BannerRow {
  id: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null; imageUrl: string; imageMobileUrl: string | null;
  alt: string | null; theme: "dark" | "light"; placement: "home" | "category"; categoryId: string | null; categoryName: string | null;
  startsAt: Date | null; endsAt: Date | null; sortOrder: number; isActive: boolean; createdAt: Date;
}

export function BannerFields({ b, categories }: { b?: BannerRow; categories: { id: string; label: string }[] }) {
  return (
    <div className="space-y-4">
      {b && <input type="hidden" name="bannerId" value={b.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Headline<input name="title" required maxLength={80} defaultValue={b?.title} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Sub-heading<input name="subtitle" maxLength={160} defaultValue={b?.subtitle ?? ""} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Button text<input name="ctaLabel" maxLength={30} defaultValue={b?.ctaLabel ?? ""} placeholder="Shop now" className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Button link<input name="ctaHref" maxLength={200} defaultValue={b?.ctaHref ?? ""} placeholder="/c/electronics" className="input mt-1.5 font-mono text-sm" /></label>
      </div>
      <fieldset className="space-y-3 rounded-xl p-4 ring-1 ring-line">
        <legend className="px-1 text-sm font-semibold">Image</legend>
        {b && <img src={mediaSrc(b.imageUrl)} alt="" className="h-28 w-full max-w-md rounded-lg object-cover ring-1 ring-line" />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">{b ? "Replace image" : "Upload image"} <span className="font-normal text-ink-muted">(wide, ~1600 × 600)</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif" className="mt-1.5 block text-sm" /></label>
          <label className="text-sm font-medium">…or image link<input name="imageUrl" type="url" placeholder="https://images.unsplash.com/…" className="input mt-1.5 text-sm" /></label>
          <label className="text-sm font-medium">Mobile image <span className="font-normal text-ink-muted">(optional, ~800 × 800)</span><input type="file" name="imageMobile" accept="image/jpeg,image/png,image/webp,image/avif" className="mt-1.5 block text-sm" /></label>
          <label className="text-sm font-medium">…or mobile image link<input name="imageMobileUrl" type="url" className="input mt-1.5 text-sm" /></label>
        </div>
        {b?.imageMobileUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeMobile" className="size-4" /> Remove the mobile image</label>}
        <label className="block text-sm font-medium">Alt text<input name="alt" required maxLength={160} defaultValue={b?.alt ?? ""} placeholder="Wireless headphones on a yellow background" className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Text colour<select name="theme" defaultValue={b?.theme ?? "dark"} className="input mt-1.5 w-60"><option value="dark">Light text on a dark image</option><option value="light">Dark text on a light image</option></select></label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Where<select name="placement" defaultValue={b?.placement ?? "home"} className="input mt-1.5"><option value="home">Homepage carousel</option><option value="category">A category page</option></select></label>
        <label className="text-sm font-medium">Category <span className="font-normal text-ink-muted">(for category pages; also shows on its subcategories)</span><select name="categoryId" defaultValue={b?.categoryId ?? ""} className="input mt-1.5"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="text-sm font-medium">Show from (IST, optional)<input name="startsAt" type="datetime-local" defaultValue={istLocal(b?.startsAt)} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Show until (IST, optional)<input name="endsAt" type="datetime-local" defaultValue={istLocal(b?.endsAt)} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Order <span className="font-normal text-ink-muted">(lower first)</span><input name="sortOrder" inputMode="numeric" defaultValue={b?.sortOrder ?? 0} className="input mt-1.5" /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={b?.isActive ?? true} className="size-4" /> Active</label>
      </div>
    </div>
  );
}

export const BANNER_COLS = `b.id, b.title, b.subtitle, b.cta_label as "ctaLabel", b.cta_href as "ctaHref", b.image_url as "imageUrl", b.image_mobile_url as "imageMobileUrl",
  b.alt, b.theme, b.placement, b.category_id as "categoryId", c.name as "categoryName", b.starts_at as "startsAt", b.ends_at as "endsAt",
  b.sort_order as "sortOrder", b.is_active as "isActive", b.created_at as "createdAt"`;

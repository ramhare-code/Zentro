import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ProductFields } from "@/components/ProductFields";
import { ProductStatusBadge } from "@/components/ProductStatus";
import {
  addVideoAction, adjustStockAction, mediaAction, removeVariantAction, saveVariantAction, setVisibilityAction, updateProductAction, uploadMediaAction,
} from "@/lib/actions/catalog";
import { catalogOptions, getProductForEdit, STOCK_REASONS } from "@/lib/catalog-admin";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { mediaSrc } from "@/lib/media";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Edit product" };

const optText = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join("; ");

export default async function ProductEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const s = await requirePermission("products.read");
  const id = z.guid().safeParse((await params).id).data;
  const p = id ? await getProductForEdit(id) : null;
  if (!p) notFound();
  const { created } = await searchParams;
  const opts = await catalogOptions();
  const movements = await db()<{ sku: string; delta: number; after: number; reason: string; note: string | null; staff: string | null; at: Date }[]>`
    select v.sku, m.delta, m.stock_after as after, m.reason, m.note, u.full_name as staff, m.created_at as at
    from shop.stock_movements m join shop.product_variants v on v.id = m.variant_id left join shop.staff_users u on u.id = m.staff_id
    where v.product_id = ${p.id} order by m.id desc limit 15`;
  const can = (k: Parameters<typeof s.permissions.has>[0]) => s.permissions.has(k);
  const write = can("products.write");
  const images = p.media.filter((m) => m.kind === "image");
  const storefront = (process.env.STOREFRONT_URL ?? "").replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/products" className="text-sm font-semibold text-brand-700 hover:underline">← Products</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight">{p.name} <ProductStatusBadge status={p.status} /></h1>
          <p className="text-sm text-ink-muted">{p.unitsSold} sold · {p.ratingCount ? `${p.ratingAvg.toFixed(1)}★ from ${p.ratingCount} verified review(s)` : "no reviews yet"} · updated {formatDateTime(p.updatedAt)}</p>
        </div>
        {p.status === "published" && storefront && <a href={`${storefront}/p/${p.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">View on shop ↗</a>}
      </div>
      {created && <p role="status" className="rounded-xl bg-good-50 p-4 text-sm text-good-700">Draft created. Add images below, then publish when ready.</p>}

      {(can("products.publish") || can("products.archive")) && (
        <section className="card p-5" aria-labelledby="vis-h">
          <h2 id="vis-h" className="font-semibold">Visibility</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {p.status === "published" && "Live on the shop."}
            {p.status === "scheduled" && `Goes live ${formatDateTime(p.publishAt)} (IST).`}
            {p.status === "draft" && "Draft — hidden from customers."}
            {p.status === "archived" && "Archived — hidden everywhere; past orders are unaffected."}
            {" "}Publishing needs at least one active variant and one image.
          </p>
          <ActionForm action={setVisibilityAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="productId" value={p.id} />
            {p.status !== "archived" && can("products.publish") && (
              <>
                {p.status !== "published" && <SubmitButton name="op" value="publish">Publish now</SubmitButton>}
                <label className="text-sm font-medium">Schedule (IST)<input type="datetime-local" name="publishAt" className="input mt-1 h-10 w-56" /></label>
                <SubmitButton name="op" value="schedule" variant="secondary">Schedule</SubmitButton>
                {(p.status === "published" || p.status === "scheduled") && <SubmitButton name="op" value="unpublish" variant="secondary">Unpublish</SubmitButton>}
              </>
            )}
            {can("products.archive") && (p.status === "archived"
              ? <SubmitButton name="op" value="restore" variant="secondary">Restore as draft</SubmitButton>
              : <SubmitButton name="op" value="archive" variant="danger" confirm="Archive this product? It disappears from the shop and carts; order history is kept.">Archive</SubmitButton>)}
          </ActionForm>
        </section>
      )}

      <section className="card p-5" aria-labelledby="det-h">
        <h2 id="det-h" className="font-semibold">Details</h2>
        {write ? (
          <ActionForm action={updateProductAction} className="mt-4 space-y-4">
            <input type="hidden" name="productId" value={p.id} />
            <ProductFields p={p} opts={opts} />
            <SubmitButton>Save details</SubmitButton>
          </ActionForm>
        ) : <p className="mt-2 text-sm text-ink-muted">You can view this product but not edit it.</p>}
      </section>

      <section className="card p-5" aria-labelledby="var-h">
        <h2 id="var-h" className="font-semibold">Variants, prices & stock</h2>
        <p className="mt-1 text-sm text-ink-muted">Options like “Color=Black; Size=M”. Prices include GST. Stock changes are logged with a reason.</p>
        <ul className="mt-4 space-y-3">
          {p.variants.map((v) => (
            <li key={v.id} className={`rounded-xl p-4 ring-1 ring-line ${v.isActive ? "bg-white" : "bg-canvas opacity-80"}`} aria-label={`Variant ${v.sku}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><span className="font-mono font-semibold">{v.sku}</span> {Object.keys(v.options).length > 0 && <span className="text-ink-muted">· {Object.values(v.options).join(" / ")}</span>}{!v.isActive && <span className="ml-2 text-xs font-semibold text-ink-muted">inactive</span>}</span>
                <span>{formatPaise(v.pricePaise)} <span className="text-ink-subtle line-through">{v.mrpPaise > v.pricePaise ? formatPaise(v.mrpPaise) : ""}</span> · <strong className={v.stock === 0 ? "text-bad-700" : v.stock <= v.lowStockThreshold ? "text-warn-700" : ""}>{v.stock} in stock</strong></span>
              </div>
              {write && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-700">Edit variant</summary>
                  <ActionForm action={saveVariantAction} className="mt-3 grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="variantId" value={v.id} />
                    <label className="text-sm font-medium">SKU<input name="sku" defaultValue={v.sku} required className="input mt-1 h-10 font-mono uppercase" /></label>
                    <label className="text-sm font-medium md:col-span-3">Options<input name="options" defaultValue={optText(v.options)} className="input mt-1 h-10" /></label>
                    <label className="text-sm font-medium">Price (₹)<input name="price" defaultValue={v.pricePaise / 100} required className="input mt-1 h-10" /></label>
                    <label className="text-sm font-medium">MRP (₹)<input name="mrp" defaultValue={v.mrpPaise / 100} className="input mt-1 h-10" /></label>
                    <label className="text-sm font-medium">Weight (g)<input name="weightGrams" defaultValue={v.weightGrams ?? ""} className="input mt-1 h-10" /></label>
                    <label className="text-sm font-medium">Low-stock alert at<input name="lowStockThreshold" type="number" min={0} defaultValue={v.lowStockThreshold} className="input mt-1 h-10" /></label>
                    <label className="text-sm font-medium md:col-span-2">Image for this variant<select name="mediaId" defaultValue={v.mediaId ?? ""} className="input mt-1 h-10"><option value="">Product’s main image</option>{images.map((m, i) => <option key={m.id} value={m.id}>Image {i + 1}{m.alt ? ` — ${m.alt.slice(0, 40)}` : ""}</option>)}</select></label>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={v.isActive} className="size-4 accent-brand-600" />Active</label>
                    <div className="md:col-span-4"><SubmitButton variant="secondary">Save variant</SubmitButton></div>
                  </ActionForm>
                  <ActionForm action={removeVariantAction} className="mt-2">
                    <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="variantId" value={v.id} />
                    <SubmitButton variant="secondary" className="h-9 text-bad-700" confirm={v.ordered ? "This variant has orders, so it will be deactivated rather than deleted. Continue?" : "Delete this variant?"}>{v.ordered ? "Deactivate" : "Delete"} variant</SubmitButton>
                  </ActionForm>
                </details>
              )}
              {can("inventory.adjust") && (
                <ActionForm action={adjustStockAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                  <input type="hidden" name="variantId" value={v.id} />
                  <label className="text-xs font-medium">Stock<select name="mode" className="input mt-1 h-9 w-28 text-sm"><option value="add">Add</option><option value="remove">Remove</option><option value="set">Set to</option></select></label>
                  <label className="text-xs font-medium">Quantity<input name="quantity" type="number" min={0} required className="input mt-1 h-9 w-24 text-sm" /></label>
                  <label className="text-xs font-medium">Reason<select name="reason" required defaultValue="" className="input mt-1 h-9 w-48 text-sm"><option value="" disabled>Choose…</option>{Object.entries(STOCK_REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <label className="min-w-40 flex-1 text-xs font-medium">Note<input name="note" maxLength={300} className="input mt-1 h-9 text-sm" /></label>
                  <SubmitButton variant="secondary" className="h-9">Update stock</SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {write && (
          <details className="mt-4 rounded-xl bg-canvas p-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">+ Add a variant</summary>
            <ActionForm action={saveVariantAction} className="mt-3 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="productId" value={p.id} />
              <label className="text-sm font-medium">SKU<input name="sku" required className="input mt-1 h-10 font-mono uppercase" /></label>
              <label className="text-sm font-medium md:col-span-3">Options<input name="options" placeholder="Color=Black; Size=M" className="input mt-1 h-10" /></label>
              <label className="text-sm font-medium">Price (₹)<input name="price" required className="input mt-1 h-10" /></label>
              <label className="text-sm font-medium">MRP (₹)<input name="mrp" className="input mt-1 h-10" /></label>
              <label className="text-sm font-medium">Opening stock<input name="stock" type="number" min={0} defaultValue={0} className="input mt-1 h-10" /></label>
              <label className="text-sm font-medium">Weight (g)<input name="weightGrams" className="input mt-1 h-10" /></label>
              <input type="hidden" name="isActive" value="on" />
              <div className="md:col-span-4"><SubmitButton variant="secondary">Add variant</SubmitButton></div>
            </ActionForm>
          </details>
        )}
        {movements.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">Recent stock movements</summary>
            <table className="mt-2 w-full text-sm"><tbody className="divide-y divide-line">
              {movements.map((m, i) => <tr key={i}><td className="py-1.5 font-mono text-xs">{m.sku}</td><td className={`py-1.5 font-semibold ${m.delta > 0 ? "text-good-700" : "text-bad-700"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</td><td className="py-1.5">→ {m.after}</td><td className="py-1.5 text-ink-muted">{m.reason.replace(/_/g, " ")}{m.note && ` — ${m.note}`}</td><td className="py-1.5 text-ink-muted">{m.staff ?? "system"}</td><td className="py-1.5 text-right text-ink-muted">{formatDateTime(m.at)}</td></tr>)}
            </tbody></table>
          </details>
        )}
      </section>

      <section className="card p-5" aria-labelledby="media-h">
        <h2 id="media-h" className="font-semibold">Images & video</h2>
        <p className="mt-1 text-sm text-ink-muted">The first image is the main one. JPEG, PNG, WebP or AVIF, up to 5 MB, at least 200 × 200 px — square images of 1200 px or more look best.</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {p.media.map((m, i) => (
            <li key={m.id} className="rounded-xl bg-canvas p-3" aria-label={`${m.kind === "image" ? "Image" : "Video"} ${i + 1}`}>
              {m.kind === "image" ? <img src={mediaSrc(m.url)} alt={m.alt} className="aspect-square w-full rounded-lg bg-white object-cover" /> : (
                <div className="grid aspect-square w-full place-items-center rounded-lg bg-ink text-sm text-white">▶ {m.kind === "youtube" ? "YouTube video" : "Video"}</div>
              )}
              <p className="mt-2 text-xs text-ink-muted">{i === 0 ? "Main · " : ""}{m.width && m.height ? `${m.width}×${m.height}` : m.kind}</p>
              {write && (
                <ActionForm action={mediaAction} className="mt-2 space-y-2">
                  <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="mediaId" value={m.id} />
                  <input name="alt" defaultValue={m.alt} maxLength={200} aria-label="Alt text" placeholder="Describe the image" className="input h-9 text-xs" />
                  <div className="flex flex-wrap gap-1">
                    <SubmitButton name="op" value="alt" variant="secondary" className="h-8 px-2 text-xs">Save alt</SubmitButton>
                    {i > 0 && <SubmitButton name="op" value="up" variant="secondary" className="h-8 px-2 text-xs">← Move</SubmitButton>}
                    {i < p.media.length - 1 && <SubmitButton name="op" value="down" variant="secondary" className="h-8 px-2 text-xs">Move →</SubmitButton>}
                    <SubmitButton name="op" value="delete" variant="secondary" className="h-8 px-2 text-xs text-bad-700" confirm="Remove this image?">Remove</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {write && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ActionForm action={uploadMediaAction} className="space-y-3 rounded-xl bg-canvas p-4">
              <input type="hidden" name="productId" value={p.id} />
              <label className="block text-sm font-medium">Upload images<input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="mt-1.5 block w-full text-sm" /></label>
              <label className="block text-sm font-medium">…or image link <span className="font-normal text-ink-muted">(approved hosts only)</span><input name="imageUrl" type="url" placeholder="https://" className="input mt-1.5 h-10" /></label>
              <SubmitButton variant="secondary">Add images</SubmitButton>
            </ActionForm>
            <ActionForm action={addVideoAction} className="space-y-3 rounded-xl bg-canvas p-4">
              <input type="hidden" name="productId" value={p.id} />
              <label className="block text-sm font-medium">Video link <span className="font-normal text-ink-muted">(YouTube, or .mp4 / .webm)</span><input name="videoUrl" type="url" placeholder="https://youtu.be/… or https://…/demo.mp4" className="input mt-1.5 h-10" /></label>
              <label className="block text-sm font-medium">Cover image<select name="posterMediaId" className="input mt-1.5 h-10"><option value="">None</option>{images.map((m, i) => <option key={m.id} value={m.id}>Image {i + 1}</option>)}</select></label>
              <input type="hidden" name="alt" value={`${p.name} video`} />
              <SubmitButton variant="secondary">Add video</SubmitButton>
            </ActionForm>
          </div>
        )}
      </section>
    </div>
  );
}

import Image from "next/image";
import type { ProductDetail } from "@/lib/catalog";
import { RichText } from "../content/RichText";
import { BoxIcon } from "../icons";
import { VideoFile, YouTubeEmbed } from "./MediaEmbed";

/** Jump links to the long-form sections below the buy box. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="sticky top-16 z-20 -mx-4 mt-10 border-y border-line bg-white/95 px-4 backdrop-blur sm:mx-0 sm:rounded-full sm:border sm:px-2 lg:top-[7.25rem]">
      <ul className="flex gap-1 overflow-x-auto py-1.5 scrollbar-none">
        {items.map((it) => (
          <li key={it.id} className="shrink-0">
            <a href={`#${it.id}`} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-ink-muted hover:bg-brand-50 hover:text-brand-700">{it.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AboutSection({ product }: { product: ProductDetail }) {
  if (!product.highlights.length && !product.description) return null;
  return (
    <section id="description" aria-labelledby="description-h" className="scroll-mt-36 rounded-card bg-white p-6 ring-1 ring-line sm:p-8">
      <h2 id="description-h" className="font-display text-xl font-bold sm:text-2xl">About this item</h2>
      {product.highlights.length > 0 && (
        <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {product.highlights.map((h) => (
            <li key={h} className="flex gap-2.5 text-sm leading-relaxed"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-600" />{h}</li>
          ))}
        </ul>
      )}
      {product.description && (
        <div className={product.highlights.length ? "mt-6 border-t border-line pt-6" : "mt-4"}>
          <h3 className="sr-only">Product description</h3>
          <RichText body={product.description} values={{}} />
        </div>
      )}
    </section>
  );
}

/** "From the brand": media and text side by side, alternating sides; stacked on phones. */
export function BrandStory({ product }: { product: ProductDetail }) {
  if (!product.brandStory.length) return null;
  return (
    <section id="from-the-brand" aria-labelledby="brand-h" className="scroll-mt-36">
      <h2 id="brand-h" className="font-display text-xl font-bold sm:text-2xl">From the brand{product.brand ? ` · ${product.brand.name}` : ""}</h2>
      <div className="mt-5 space-y-6">
        {product.brandStory.map((s, i) => {
          const media = s.mediaUrl && s.mediaKind;
          return (
            <article key={i} className="grid items-center gap-6 overflow-hidden rounded-card bg-white p-4 ring-1 ring-line sm:p-6 md:grid-cols-2 md:gap-10">
              {media && (
                <div className={`relative aspect-video overflow-hidden rounded-2xl bg-brand-50 md:aspect-[4/3] ${i % 2 ? "md:order-2" : ""}`}>
                  {s.mediaKind === "youtube" ? (
                    <YouTubeEmbed url={s.mediaUrl!} title={s.title} className="absolute inset-0 size-full" />
                  ) : s.mediaKind === "video" ? (
                    <VideoFile url={s.mediaUrl!} title={s.title} className="absolute inset-0 size-full" />
                  ) : (
                    <Image src={s.mediaUrl!} alt={s.title} fill sizes="(min-width: 768px) 560px, 100vw" className="object-cover" />
                  )}
                </div>
              )}
              <div className={media ? "" : "md:col-span-2"}>
                <h3 className="font-display text-lg font-bold sm:text-xl">{s.title}</h3>
                {s.body && <div className="mt-3 text-sm sm:text-base"><RichText body={s.body} values={{}} /></div>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function SpecsAndInfo({ product }: { product: ProductDetail }) {
  const info: { label: string; value: React.ReactNode }[] = [];
  if (product.brand) info.push({ label: "Brand", value: product.brand.name });
  if (product.warranty) info.push({ label: "Warranty", value: product.warranty });
  if (product.countryOfOrigin) info.push({ label: "Country of origin", value: product.countryOfOrigin });
  if (product.careInstructions) info.push({ label: "Care instructions", value: <span className="whitespace-pre-line">{product.careInstructions}</span> });
  if (product.manufacturerInfo) info.push({ label: "Manufacturer, packer & importer", value: <span className="whitespace-pre-line">{product.manufacturerInfo}</span> });
  const hasSpecs = product.specifications.length > 0;
  if (!hasSpecs && !info.length && !product.boxContents.length) return null;
  return (
    <section id="specifications" aria-labelledby="specs-h" className="scroll-mt-36 grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="rounded-card bg-white p-6 ring-1 ring-line sm:p-8">
        <h2 id="specs-h" className="font-display text-xl font-bold sm:text-2xl">Specifications</h2>
        {hasSpecs ? product.specifications.map((g) => (
          <div key={g.group} className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">{g.group}</h3>
            <dl className="mt-2 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line text-sm">
              {g.items.map((it, j) => (
                <div key={it.label} className={`grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-2.5 ${j % 2 ? "bg-white" : "bg-canvas"}`}>
                  <dt className="text-ink-muted">{it.label}</dt>
                  <dd className="font-medium">{it.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )) : <p className="mt-3 text-sm text-ink-muted">No specifications listed.</p>}
        {info.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Product information</h3>
            <dl className="mt-2 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line text-sm">
              {info.map((it, j) => (
                <div key={it.label} className={`grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-2.5 ${j % 2 ? "bg-white" : "bg-canvas"}`}>
                  <dt className="text-ink-muted">{it.label}</dt>
                  <dd className="font-medium">{it.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      {product.boxContents.length > 0 && (
        <div className="self-start rounded-card bg-white p-6 ring-1 ring-line sm:p-8">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><BoxIcon size={22} className="text-brand-700" />What’s in the box</h2>
          <ul className="mt-4 space-y-2.5">
            {product.boxContents.map((b) => (
              <li key={b} className="flex gap-2.5 text-sm"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-500" />{b}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

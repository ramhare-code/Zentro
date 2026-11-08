"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { youtubeId, youtubeThumbUrl } from "@zentro/commerce/product-media";
import type { Media } from "@/lib/catalog";
import { ChevronLeft, ChevronRight, CloseIcon, PlayIcon, ZoomIcon } from "../icons";
import { VideoFile, YouTubeEmbed } from "./MediaEmbed";

function thumbOf(m: Media): string | null {
  if (m.kind === "image") return m.url;
  if (m.kind === "youtube") { const id = youtubeId(m.url); return m.posterUrl ?? (id ? youtubeThumbUrl(id) : null); }
  return m.posterUrl;
}

const label = (m: Media, i: number, n: number) => `${m.kind === "image" ? "Photo" : "Video"} ${i + 1} of ${n}`;

function Tile({ m, name, priority, onOpen }: { m: Media; name: string; priority?: boolean; onOpen: () => void }) {
  if (m.kind === "youtube") return <YouTubeEmbed url={m.url} title={m.alt || `${name} video`} className="block size-full" />;
  if (m.kind === "video") return <VideoFile url={m.url} poster={m.posterUrl} title={m.alt || `${name} video`} className="size-full" />;
  return (
    <button type="button" onClick={onOpen} aria-label={`Open ${m.alt || name} full screen`} className="group relative block size-full cursor-zoom-in">
      <Image src={m.url} alt={m.alt || name} fill priority={priority} sizes="(min-width: 1024px) 340px, 100vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" />
      <span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-white/90 text-ink opacity-0 shadow transition group-hover:opacity-100"><ZoomIcon size={16} /></span>
    </button>
  );
}

/**
 * Computers: every photo and video side by side in a two-column grid.
 * Phones/tablets: a swipeable strip with dots. Photos open a full-screen viewer.
 */
export function Gallery({ media: all, activeId, productName }: { media: Media[]; activeId?: string | null; productName: string }) {
  // the selected variant's photo leads
  const media = useMemo(() => {
    const i = activeId ? all.findIndex((m) => m.id === activeId) : -1;
    return i > 0 ? [all[i]!, ...all.slice(0, i), ...all.slice(i + 1)] : all;
  }, [all, activeId]);
  const images = media.filter((m) => m.kind === "image");
  const [slide, setSlide] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const strip = useRef<HTMLUListElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { strip.current?.scrollTo({ left: 0 }); setSlide(0); }, [activeId]);
  useEffect(() => {
    if (viewer === null) dialog.current?.close();
    else if (!dialog.current?.open) dialog.current?.showModal();
  }, [viewer]);

  const open = (m: Media) => setViewer(Math.max(0, images.indexOf(m)));
  const step = useCallback((d: number) => setViewer((v) => (v === null ? v : (v + d + images.length) % images.length)), [images.length]);
  const goSlide = (i: number) => { const el = strip.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };

  if (!media.length) return <div className="aspect-square rounded-card bg-brand-50" aria-hidden />;
  const current = viewer !== null ? images[viewer] : null;

  return (
    <div>
      {/* computers: side-by-side grid */}
      <ul aria-label="Product photos and videos" className={clsx("hidden gap-3 lg:grid", media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {media.map((m, i) => (
          <li key={m.id} className={clsx("relative aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-line", m.kind !== "image" && "bg-ink")}>
            <Tile m={m} name={productName} priority={i < 2} onOpen={() => open(m)} />
            {m.kind !== "image" && <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-semibold text-white"><PlayIcon size={12} />Video</span>}
          </li>
        ))}
      </ul>

      {/* phones and tablets: swipe */}
      <div className="lg:hidden">
        <ul
          ref={strip}
          aria-label="Product photos and videos"
          onScroll={(e) => { const el = e.currentTarget; setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
          className="-mx-4 flex snap-x snap-mandatory overflow-x-auto scrollbar-none sm:mx-0 sm:rounded-card"
        >
          {media.map((m, i) => (
            <li key={m.id} aria-label={label(m, i, media.length)} className={clsx("relative aspect-square w-full shrink-0 snap-center overflow-hidden", m.kind === "image" ? "bg-white" : "bg-ink")}>
              <Tile m={m} name={productName} priority={i === 0} onOpen={() => open(m)} />
            </li>
          ))}
        </ul>
        {media.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1.5" role="group" aria-label="Choose photo or video">
            {media.map((m, i) => (
              <button key={m.id} type="button" onClick={() => goSlide(i)} aria-label={`Show ${label(m, i, media.length).toLowerCase()}`} aria-current={i === slide}
                className={clsx("h-2 rounded-full transition-all", i === slide ? "w-6 bg-brand-600" : "w-2 bg-line-strong")}>
                {m.kind !== "image" && <span className="sr-only">(video)</span>}
              </button>
            ))}
          </div>
        )}
        {media.length > 1 && (
          <ul className="mt-3 flex gap-2 overflow-x-auto scrollbar-none" aria-hidden>
            {media.map((m, i) => (
              <li key={m.id} className="shrink-0">
                <button type="button" tabIndex={-1} onClick={() => goSlide(i)} className={clsx("relative block size-14 overflow-hidden rounded-xl bg-brand-50 ring-2", i === slide ? "ring-brand-600" : "ring-transparent")}>
                  {thumbOf(m) ? <Image src={thumbOf(m)!} alt="" fill sizes="56px" className="object-cover" /> : <span className="absolute inset-0 bg-ink" />}
                  {m.kind !== "image" && <span className="absolute inset-0 grid place-items-center bg-ink/30 text-white"><PlayIcon size={16} /></span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* full-screen viewer for photos */}
      <dialog
        ref={dialog}
        aria-label="Product photos"
        onClose={() => setViewer(null)}
        onKeyDown={(e) => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); }}
        onClick={(e) => e.target === dialog.current && setViewer(null)}
        className="m-auto size-full max-h-none max-w-none bg-white p-0 backdrop:bg-ink/80"
      >
        {current && (
          <div className="relative size-full">
            <Image src={current.url} alt={current.alt || productName} fill sizes="100vw" className="object-contain" />
            <span className="absolute left-4 top-4 rounded-full bg-ink/80 px-3 py-1.5 text-sm font-semibold text-white" aria-live="polite">{viewer! + 1} / {images.length}</span>
            <button type="button" onClick={() => setViewer(null)} aria-label="Close" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-ink/80 text-white"><CloseIcon /></button>
            {images.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-pop ring-1 ring-line"><ChevronLeft /></button>
                <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-pop ring-1 ring-line"><ChevronRight /></button>
              </>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}

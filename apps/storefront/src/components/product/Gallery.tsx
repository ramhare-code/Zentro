"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Media } from "@/lib/catalog";
import { CloseIcon, PlayIcon, ZoomIcon } from "../icons";

export function Gallery({ media, activeId, productName }: { media: Media[]; activeId?: string | null; productName: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!activeId) return;
    const i = media.findIndex((m) => m.id === activeId);
    if (i >= 0) setIndex(i);
  }, [activeId, media]);

  const current = media[index];
  if (!current) {
    return <div className="aspect-square rounded-card bg-brand-50" aria-hidden />;
  }

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {media.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto scrollbar-none md:w-20 md:flex-col" aria-label="Product media">
          {media.map((m, i) => (
            <li key={m.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${m.kind === "video" ? "video" : "image"} ${i + 1} of ${media.length}`}
                aria-current={i === index}
                className={clsx("relative block size-16 overflow-hidden rounded-xl bg-brand-50 ring-2 md:size-20", i === index ? "ring-brand-600" : "ring-transparent hover:ring-line-strong")}
              >
                <Image src={m.kind === "video" ? (m.posterUrl ?? m.url) : m.url} alt="" fill sizes="80px" className="object-cover" />
                {m.kind === "video" && <span className="absolute inset-0 grid place-items-center bg-ink/30 text-white"><PlayIcon size={20} /></span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex-1">
        {current.kind === "video" ? (
          <video
            key={current.id}
            src={current.url}
            poster={current.posterUrl ?? undefined}
            controls
            preload="none"
            playsInline
            className="aspect-square w-full rounded-card bg-ink object-contain"
          >
            <track kind="captions" />
          </video>
        ) : (
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
            aria-label="Open full-screen image"
            className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-card bg-white ring-1 ring-line"
          >
            <Image
              src={current.url}
              alt={current.alt || productName}
              fill
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover transition-transform duration-200"
              style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
            <span className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <ZoomIcon size={18} />
            </span>
          </button>
        )}
      </div>

      <dialog ref={dialog} aria-label="Product image" className="m-auto size-full max-h-none max-w-none bg-white p-0 backdrop:bg-ink/80" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="relative size-full">
          <Image src={current.url} alt={current.alt || productName} fill sizes="100vw" className="object-contain" />
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-ink/80 text-white">
            <CloseIcon />
          </button>
        </div>
      </dialog>
    </div>
  );
}

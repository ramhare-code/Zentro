"use client";

import Image from "next/image";
import { useState } from "react";
import { youtubeEmbedUrl, youtubeId, youtubeThumbUrl } from "@zentro/commerce/product-media";
import { PlayIcon } from "../icons";

/**
 * YouTube without the weight: shows the thumbnail and only loads the
 * privacy-enhanced (youtube-nocookie) player after the shopper taps play.
 */
export function YouTubeEmbed({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const id = youtubeId(url);
  const [playing, setPlaying] = useState(false);
  if (!id) return null;
  if (playing) {
    return (
      <iframe
        src={`${youtubeEmbedUrl(id)}&autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={`${className} border-0 bg-ink`}
      />
    );
  }
  return (
    <button type="button" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`} className={`group relative overflow-hidden bg-ink ${className}`}>
      <Image src={youtubeThumbUrl(id)} alt="" fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover opacity-90 transition group-hover:opacity-100" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-16 place-items-center rounded-full bg-white/95 text-brand-700 shadow-pop transition group-hover:scale-105"><PlayIcon size={28} /></span>
      </span>
    </button>
  );
}

/** Self-hosted .mp4/.webm with native controls; nothing downloads until play. */
export function VideoFile({ url, poster, title, className = "" }: { url: string; poster?: string | null; title: string; className?: string }) {
  return (
    <video src={url} poster={poster ?? undefined} controls preload="none" playsInline aria-label={title} className={`${className} bg-ink object-contain`}>
      <track kind="captions" />
    </video>
  );
}

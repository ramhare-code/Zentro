// Product media links: YouTube videos, hosted .mp4/.webm files and images.
// Used by the admin (validation) and the storefront (rendering).

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Returns the 11-character YouTube video id for watch, short, embed and youtu.be links. */
export function youtubeId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export const youtubeEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
export const youtubeThumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export function isVideoFileUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === "https:" && /\.(mp4|webm)$/i.test(u.pathname); } catch { return false; }
}

export type StoryMediaKind = "image" | "video" | "youtube";

export interface StorySection {
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaKind: StoryMediaKind | null;
}

/** Classifies a link for a brand-story section. `isImageAllowed` decides which image links are accepted. */
export function classifyStoryMedia(url: string, isImageAllowed: (u: string) => boolean): { url: string; kind: StoryMediaKind } | null {
  const v = url.trim();
  if (!v) return null;
  const yt = youtubeId(v);
  if (yt) return { url: `https://www.youtube.com/watch?v=${yt}`, kind: "youtube" };
  if (isVideoFileUrl(v)) return { url: v, kind: "video" };
  if (isImageAllowed(v)) return { url: v, kind: "image" };
  return null;
}

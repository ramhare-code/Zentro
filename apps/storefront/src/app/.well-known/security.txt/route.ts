import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site";
import { renderAtRequestIfConfigured } from "@/lib/render";

export const revalidate = 3600;

/** RFC 9116: where to report security issues. */
export async function GET() {
  await renderAtRequestIfConfigured();
  const s = await getSettings();
  const contact = s.supportEmail ? `mailto:${s.supportEmail}` : siteUrl("/contact");
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  return new Response(`Contact: ${contact}\nExpires: ${expires}\nPreferred-Languages: en, hi\nCanonical: ${siteUrl("/.well-known/security.txt")}\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

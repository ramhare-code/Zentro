import "server-only";
import { headers } from "next/headers";

/** Client IP as reported by the hosting proxy (Vercel sets x-forwarded-for). */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || h.get("x-real-ip") || null;
  const validIp = ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
  return { ip: validIp, userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

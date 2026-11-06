import "server-only";
import { db } from "./db";

/** Returns true when the call is allowed. Backed by shop.rate_limit_hit (fixed window). */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [row] = await db()<{ ok: boolean }[]>`select shop.rate_limit_hit(${bucket}, ${limit}, ${windowSeconds}) as ok`;
  return row?.ok ?? false;
}

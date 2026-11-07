import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { checkHealth } from "@zentro/commerce/ops";
import { db } from "@/lib/db";
import { integrationChecks } from "@/lib/health";

export const dynamic = "force-dynamic";
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Uptime check. Public callers get only up/down. With `Authorization: Bearer $HEALTH_CHECK_TOKEN`
 * the response also lists database, migration and integration status (never secret values).
 */
export async function GET(req: NextRequest) {
  const token = process.env.HEALTH_CHECK_TOKEN;
  const detailed = !!token && same(req.headers.get("authorization") ?? "", `Bearer ${token}`);
  const h = await checkHealth(db(), detailed ? integrationChecks : undefined);
  const body = detailed ? { status: h.ok ? "ok" : "degraded", app: "admin", commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null, ...h } : { status: h.db.ok ? "ok" : "down" };
  return NextResponse.json(body, { status: h.db.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

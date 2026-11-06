import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { stockLevels } from "@/lib/inventory";
import { getSession } from "@/lib/session";

const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };

/** Stock levels as CSV (cells that could be read as spreadsheet formulas are neutralised). */
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s?.permissions.has("inventory.read")) return new NextResponse(null, { status: 403 });
  const p = req.nextUrl.searchParams;
  const rows = await stockLevels({ q: p.get("q")?.slice(0, 100) || undefined, filter: z.enum(["low", "out", "all"]).safeParse(p.get("filter")).data, categoryId: z.guid().safeParse(p.get("categoryId")).data, limit: 50_000 });
  const lines = [["product", "sku", "options", "category", "on_hand", "reserved", "low_stock_alert", "unit_cost_inr", "value_at_cost_inr", "live"].join(",")];
  for (const r of rows) lines.push([r.product, r.sku, Object.entries(r.options).map(([k, v]) => `${k}=${v}`).join("; "), r.category, r.stock, r.reserved, r.threshold,
    r.costPaise !== null ? (r.costPaise / 100).toFixed(2) : "", r.costPaise !== null ? ((r.costPaise * r.stock) / 100).toFixed(2) : "", r.live ? "yes" : "no"].map(esc).join(","));
  await audit(s, { action: "inventory.export", details: { rows: rows.length } });
  return new NextResponse(lines.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}

import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv-out";
import { parseRange } from "@/lib/metrics";
import { buildReport, REPORTS, type ReportKey } from "@/lib/reports";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const s = await getSession();
  if (!s?.permissions.has("reports.export")) return new NextResponse(null, { status: 403 });
  const key = (await params).report;
  if (!(key in REPORTS)) return NextResponse.json({ error: "unknown report" }, { status: 400 });
  const range = parseRange(Object.fromEntries(req.nextUrl.searchParams));
  const pii = s.permissions.has("customers.pii");
  const rows = await buildReport(key as ReportKey, range, pii);
  await audit(s, { action: "report.export", details: { report: key, from: range.from, to: range.to, rows: rows.length - 1, pii } });
  return new NextResponse(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="zentro-${key}-${range.from}-to-${range.to}.csv"`, "cache-control": "no-store" },
  });
}

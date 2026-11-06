import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { creditNoteRegister, gstBreakdown, invoiceRegister, productProfit, profitSeries, profitTotals } from "@/lib/finance";
import { parseRange } from "@/lib/metrics";
import { getSession } from "@/lib/session";

const REPORTS = ["profit", "products", "gst-rate", "gst-state", "hsn", "invoices", "credit-notes"] as const;
// money in rupees with 2 decimals (accounting software and spreadsheets expect this)
const rs = (p: number) => (p / 100).toFixed(2);
const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) || /^[=+@]/.test(s) || /^-[^0-9]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s?.permissions.has("finance.export")) return new NextResponse(null, { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const report = z.enum(REPORTS).safeParse(sp.report).data;
  if (!report) return NextResponse.json({ error: "unknown report" }, { status: 400 });
  const range = parseRange(sp);
  let rows: unknown[][];
  switch (report) {
    case "profit": {
      const [t, series] = await Promise.all([profitTotals(range), profitSeries(range)]);
      rows = [["period", "orders_invoiced", "net_sales_ex_gst", "returns_ex_gst", "cost_of_goods", "gateway_fees_ex_gst", "gross_profit"],
        ...series.map((b) => [b.bucket, b.orders, rs(b.netSalesPaise), rs(b.creditNetPaise), rs(b.cogsPaise), rs(b.feesExGstPaise), rs(b.profitPaise)]),
        ["TOTAL", t.invoices, rs(t.netSalesPaise), rs(t.creditNetPaise), rs(t.cogsPaise - t.cogsReversedPaise), rs(t.feesExGstPaise), rs(t.grossProfitPaise)]];
      break;
    }
    case "products":
      rows = [["product", "units", "returned", "net_sales_ex_gst", "cost", "profit", "margin_pct"],
        ...(await productProfit(range, 5000)).map((p) => [p.name, p.units, p.returned, rs(p.netSalesPaise), p.costPaise === null ? "" : rs(p.costPaise), p.profitPaise === null ? "" : rs(p.profitPaise), p.marginPct ?? ""])];
      break;
    case "gst-rate": case "gst-state": case "hsn": {
      const by = report === "hsn" ? "hsn" : report === "gst-state" ? "state" : "rate";
      rows = [[by === "hsn" ? "hsn" : by === "state" ? "place_of_supply" : "gst_rate", "gst_rate", "supply", "quantity", "taxable_value", "cgst", "sgst", "igst", "total_tax"],
        ...(await gstBreakdown(range, by)).map((r) => [r.key, r.gstRate, r.supply === "intra" ? "intra-state" : "inter-state", r.quantity, rs(r.taxable), rs(r.cgst), rs(r.sgst), rs(r.igst), rs(r.cgst + r.sgst + r.igst)])];
      break;
    }
    case "invoices":
      rows = [["invoice_number", "invoice_date", "order_number", "customer", "place_of_supply", "taxable_value", "cgst", "sgst", "igst", "shipping", "invoice_total", "order_status"],
        ...(await invoiceRegister(range, 100_000)).map((i) => [i.number, i.issuedAt.toISOString(), i.orderNumber, i.customer, i.pos, rs(i.taxable), rs(i.cgst), rs(i.sgst), rs(i.igst), rs(i.shipping), rs(i.total), i.status])];
      break;
    case "credit-notes":
      rows = [["credit_note_number", "date", "invoice_number", "order_number", "reason", "taxable_value", "cgst", "sgst", "igst", "other", "total"],
        ...(await creditNoteRegister(range, 100_000)).map((c) => [c.number, c.issuedAt.toISOString(), c.invoiceNumber, c.orderNumber, c.reason, rs(c.taxable), rs(c.cgst), rs(c.sgst), rs(c.igst), rs(c.other), rs(c.total)])];
      break;
  }
  await audit(s, { action: "finance.export", details: { report, from: range.from, to: range.to, rows: rows.length - 1 } });
  return new NextResponse(rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="zentro-${report}-${range.from}-to-${range.to}.csv"`, "cache-control": "no-store" },
  });
}

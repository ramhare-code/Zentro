import "server-only";
import { loadStoreSettings } from "@zentro/commerce/settings";
import { db } from "./db";
import type { DateRange } from "./metrics";

// All figures in paise. Sales are recognised when the tax invoice is issued
// (payment verified); reversals when the credit note is issued.
const IST = (col: string) => `(${col} at time zone 'Asia/Kolkata')::date`;

export interface ProfitTotals {
  invoices: number; grossPaise: number; gstPaise: number; netSalesPaise: number; shippingPaise: number; untaxedShippingPaise: number; discountPaise: number;
  creditNotes: number; creditGrossPaise: number; creditGstPaise: number; creditNetPaise: number;
  cogsPaise: number; cogsReversedPaise: number; uncostedUnits: number;
  feesPaise: number; feeGstPaise: number; feesExGstPaise: number; feesMissing: number;
  grossProfitPaise: number; marginPct: number | null;
}

export async function profitTotals(r: DateRange): Promise<ProfitTotals> {
  const sql = db();
  const inv = sql.unsafe(IST("i.issued_at"));
  const cn = sql.unsafe(IST("c.issued_at"));
  const pay = sql.unsafe(IST("p.verified_at"));
  const [row] = await sql<Omit<ProfitTotals, "netSalesPaise" | "creditNetPaise" | "feesExGstPaise" | "grossProfitPaise" | "marginPct">[]>`
    select
      (select count(*)::int from shop.invoices i where ${inv} between ${r.from}::date and ${r.to}::date) as invoices,
      (select coalesce(sum(o.total_paise), 0)::bigint::float8 from shop.invoices i join shop.orders o on o.id = i.order_id where ${inv} between ${r.from}::date and ${r.to}::date) as "grossPaise",
      (select coalesce(sum(o.tax_paise), 0)::bigint::float8 from shop.invoices i join shop.orders o on o.id = i.order_id where ${inv} between ${r.from}::date and ${r.to}::date) as "gstPaise",
      (select coalesce(sum(o.shipping_paise), 0)::bigint::float8 from shop.invoices i join shop.orders o on o.id = i.order_id where ${inv} between ${r.from}::date and ${r.to}::date) as "shippingPaise",
      (select coalesce(sum(o.shipping_paise) filter (where o.shipping_taxable_paise = 0), 0)::bigint::float8 from shop.invoices i join shop.orders o on o.id = i.order_id where ${inv} between ${r.from}::date and ${r.to}::date) as "untaxedShippingPaise",
      (select coalesce(sum(o.discount_paise), 0)::bigint::float8 from shop.invoices i join shop.orders o on o.id = i.order_id where ${inv} between ${r.from}::date and ${r.to}::date) as "discountPaise",
      (select count(*)::int from shop.credit_notes c where ${cn} between ${r.from}::date and ${r.to}::date) as "creditNotes",
      (select coalesce(sum(c.total_paise), 0)::bigint::float8 from shop.credit_notes c where ${cn} between ${r.from}::date and ${r.to}::date) as "creditGrossPaise",
      (select coalesce(sum(c.cgst_paise + c.sgst_paise + c.igst_paise), 0)::bigint::float8 from shop.credit_notes c where ${cn} between ${r.from}::date and ${r.to}::date) as "creditGstPaise",
      (select coalesce(sum(it.quantity::bigint * it.unit_cost_paise), 0)::float8 from shop.invoices i join shop.order_items it on it.order_id = i.order_id
         where ${inv} between ${r.from}::date and ${r.to}::date) as "cogsPaise",
      (select coalesce(sum(it.quantity) filter (where it.unit_cost_paise is null), 0)::int from shop.invoices i join shop.order_items it on it.order_id = i.order_id
         where ${inv} between ${r.from}::date and ${r.to}::date) as "uncostedUnits",
      (select coalesce(sum((l->>'quantity')::bigint * it.unit_cost_paise), 0)::float8
         from shop.credit_notes c cross join lateral jsonb_array_elements(c.lines) l join shop.order_items it on it.id = (l->>'orderItemId')::uuid
         where ${cn} between ${r.from}::date and ${r.to}::date) as "cogsReversedPaise",
      (select coalesce(sum(p.fee_paise), 0)::bigint::float8 from shop.payments p where p.status in ('captured','refunded','partially_refunded') and ${pay} between ${r.from}::date and ${r.to}::date) as "feesPaise",
      (select coalesce(sum(p.gateway_tax_paise), 0)::bigint::float8 from shop.payments p where p.status in ('captured','refunded','partially_refunded') and ${pay} between ${r.from}::date and ${r.to}::date) as "feeGstPaise",
      (select count(*)::int from shop.payments p where p.status in ('captured','refunded','partially_refunded') and p.fee_paise is null and ${pay} between ${r.from}::date and ${r.to}::date) as "feesMissing"`;
  const t = row!;
  const netSalesPaise = t.grossPaise - t.gstPaise;
  const creditNetPaise = t.creditGrossPaise - t.creditGstPaise;
  const feesExGstPaise = t.feesPaise - t.feeGstPaise;
  const revenue = netSalesPaise - creditNetPaise;
  const grossProfitPaise = revenue - (t.cogsPaise - t.cogsReversedPaise) - feesExGstPaise;
  return { ...t, netSalesPaise, creditNetPaise, feesExGstPaise, grossProfitPaise, marginPct: revenue > 0 ? Math.round((grossProfitPaise / revenue) * 1000) / 10 : null };
}

export interface ProfitBucket { bucket: string; netSalesPaise: number; creditNetPaise: number; cogsPaise: number; feesExGstPaise: number; profitPaise: number; orders: number }

export async function profitSeries(r: DateRange): Promise<ProfitBucket[]> {
  const sql = db();
  const unit = r.bucket === "month" ? "month" : "day";
  const b = (col: string) => sql.unsafe(`to_char(date_trunc('${unit}', ${col} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`);
  const inRange = (col: string) => sql`${sql.unsafe(IST(col))} between ${r.from}::date and ${r.to}::date`;
  const rows = await sql<{ bucket: string; kind: string; v: number; n: number }[]>`
    select ${b("i.issued_at")} as bucket, 'sales' as kind, sum(o.total_paise - o.tax_paise)::float8 as v, count(*)::int as n
      from shop.invoices i join shop.orders o on o.id = i.order_id where ${inRange("i.issued_at")} group by 1
    union all
    select ${b("i.issued_at")}, 'cogs', coalesce(sum(it.quantity::bigint * it.unit_cost_paise), 0)::float8, 0
      from shop.invoices i join shop.order_items it on it.order_id = i.order_id where ${inRange("i.issued_at")} group by 1
    union all
    select ${b("c.issued_at")}, 'credit', sum(c.total_paise - c.cgst_paise - c.sgst_paise - c.igst_paise)::float8, 0
      from shop.credit_notes c where ${inRange("c.issued_at")} group by 1
    union all
    select ${b("c.issued_at")}, 'cogs_rev', coalesce(sum((l->>'quantity')::bigint * it.unit_cost_paise), 0)::float8, 0
      from shop.credit_notes c cross join lateral jsonb_array_elements(c.lines) l join shop.order_items it on it.id = (l->>'orderItemId')::uuid
      where ${inRange("c.issued_at")} group by 1
    union all
    select ${b("p.verified_at")}, 'fees', coalesce(sum(coalesce(p.fee_paise, 0) - coalesce(p.gateway_tax_paise, 0)), 0)::float8, 0
      from shop.payments p where p.status in ('captured','refunded','partially_refunded') and ${inRange("p.verified_at")} group by 1`;
  const map = new Map<string, ProfitBucket>();
  for (const x of rows) {
    const e = map.get(x.bucket) ?? { bucket: x.bucket, netSalesPaise: 0, creditNetPaise: 0, cogsPaise: 0, feesExGstPaise: 0, profitPaise: 0, orders: 0 };
    if (x.kind === "sales") { e.netSalesPaise += x.v; e.orders += x.n; }
    if (x.kind === "credit") e.creditNetPaise += x.v;
    if (x.kind === "cogs") e.cogsPaise += x.v;
    if (x.kind === "cogs_rev") e.cogsPaise -= x.v;
    if (x.kind === "fees") e.feesExGstPaise += x.v;
    map.set(x.bucket, e);
  }
  return [...map.values()].map((e) => ({ ...e, profitPaise: e.netSalesPaise - e.creditNetPaise - e.cogsPaise - e.feesExGstPaise })).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export interface ProductProfit { productId: string | null; name: string; units: number; returned: number; netSalesPaise: number; costPaise: number | null; profitPaise: number | null; marginPct: number | null }

/** Per product, for invoices in range. Returns are netted out on the original sale. */
export async function productProfit(r: DateRange, limit = 50): Promise<ProductProfit[]> {
  const sql = db();
  const rows = await sql<{ productId: string | null; name: string; units: number; returned: number; net: number; cost: number | null; uncosted: number }[]>`
    select it.product_id as "productId", min(it.product_name) as name, sum(it.quantity)::int as units,
           coalesce(sum(cr.qty), 0)::int as returned,
           sum(it.taxable_paise - round(it.taxable_paise::numeric * coalesce(cr.qty, 0) / it.quantity))::float8 as net,
           sum((it.quantity - coalesce(cr.qty, 0))::bigint * it.unit_cost_paise)::float8 as cost,
           count(*) filter (where it.unit_cost_paise is null)::int as uncosted
    from shop.invoices i join shop.order_items it on it.order_id = i.order_id
    left join lateral (select sum((l->>'quantity')::int) as qty from shop.credit_notes c cross join lateral jsonb_array_elements(c.lines) l
                       where c.order_id = it.order_id and (l->>'orderItemId')::uuid = it.id) cr on true
    where ${sql.unsafe(IST("i.issued_at"))} between ${r.from}::date and ${r.to}::date
    group by it.product_id order by net desc limit ${limit}`;
  return rows.map((x) => {
    const cost = x.uncosted ? null : x.cost ?? 0;
    const profit = cost === null ? null : x.net - cost;
    return { productId: x.productId, name: x.name, units: x.units, returned: x.returned, netSalesPaise: x.net, costPaise: cost, profitPaise: profit, marginPct: profit !== null && x.net > 0 ? Math.round((profit / x.net) * 1000) / 10 : null };
  });
}

// ------------------------------------------------------------------ GST

export interface GstRow { key: string; supply: "intra" | "inter"; gstRate: string; taxable: number; cgst: number; sgst: number; igst: number; quantity: number }

/**
 * Outward supplies net of credit notes, grouped by `by` (rate, HSN or state).
 * Positive rows come from invoices issued in range, negative from credit notes issued in range.
 */
export async function gstBreakdown(r: DateRange, by: "rate" | "hsn" | "state"): Promise<GstRow[]> {
  const sql = db();
  // intra-state = place of supply is the seller's state (falls back to "no IGST charged" if not configured)
  const seller = (await loadStoreSettings(sql)).stateCode ?? "";
  const intraInv = seller ? sql`o.place_of_supply = ${seller}` : sql`it.igst_paise = 0`;
  const intraCn = seller ? sql`o.place_of_supply = ${seller}` : sql`(l->>'igst')::int = 0`;
  const key = by === "hsn" ? sql`coalesce(x.hsn, 'NOT SET')` : by === "state" ? sql`x.pos` : sql`x.rate`;
  return sql<GstRow[]>`
    with x as (
      select it.hsn_code as hsn, it.gst_rate::text as rate, o.place_of_supply as pos, ${intraInv} as intra,
             it.quantity as qty, it.taxable_paise as taxable, it.cgst_paise as cgst, it.sgst_paise as sgst, it.igst_paise as igst
      from shop.invoices i join shop.orders o on o.id = i.order_id join shop.order_items it on it.order_id = o.id
      where ${sql.unsafe(IST("i.issued_at"))} between ${r.from}::date and ${r.to}::date
      union all
      -- GST inside the shipping charge (composite supply), when enabled in settings
      select 'SHIPPING', o.shipping_gst_rate::text, o.place_of_supply, ${seller ? sql`o.place_of_supply = ${seller}` : sql`o.shipping_igst_paise = 0`},
             0, o.shipping_taxable_paise, o.shipping_cgst_paise, o.shipping_sgst_paise, o.shipping_igst_paise
      from shop.invoices i join shop.orders o on o.id = i.order_id
      where o.shipping_taxable_paise > 0 and ${sql.unsafe(IST("i.issued_at"))} between ${r.from}::date and ${r.to}::date
      union all
      select l->>'hsn', l->>'gstRate', o.place_of_supply, ${intraCn},
             -(l->>'quantity')::int, -(l->>'taxable')::int, -(l->>'cgst')::int, -(l->>'sgst')::int, -(l->>'igst')::int
      from shop.credit_notes c join shop.orders o on o.id = c.order_id cross join lateral jsonb_array_elements(c.lines) l
      where ${sql.unsafe(IST("c.issued_at"))} between ${r.from}::date and ${r.to}::date
    )
    select ${key} as key, case when bool_and(x.intra) then 'intra' else 'inter' end as supply, min(x.rate) as "gstRate",
           sum(x.taxable)::float8 as taxable, sum(x.cgst)::float8 as cgst, sum(x.sgst)::float8 as sgst, sum(x.igst)::float8 as igst, sum(x.qty)::int as quantity
    from x group by ${key}${by === "rate" ? sql`, x.intra` : sql`, x.rate`}
    order by 1, 3, 2`;
}

export interface InvoiceRow { number: string; issuedAt: Date; orderNumber: string; orderId: string; customer: string; pos: string; taxable: number; cgst: number; sgst: number; igst: number; shipping: number; total: number; status: string }
export async function invoiceRegister(r: DateRange, limit = 1000): Promise<InvoiceRow[]> {
  const sql = db();
  return sql<InvoiceRow[]>`
    select i.invoice_number as number, i.issued_at as "issuedAt", o.order_number as "orderNumber", o.id as "orderId",
           o.shipping_address->>'fullName' as customer, o.place_of_supply as pos,
           (select coalesce(sum(taxable_paise), 0)::int from shop.order_items where order_id = o.id) + o.shipping_taxable_paise as taxable,
           (select coalesce(sum(cgst_paise), 0)::int from shop.order_items where order_id = o.id) + o.shipping_cgst_paise as cgst,
           (select coalesce(sum(sgst_paise), 0)::int from shop.order_items where order_id = o.id) + o.shipping_sgst_paise as sgst,
           (select coalesce(sum(igst_paise), 0)::int from shop.order_items where order_id = o.id) + o.shipping_igst_paise as igst,
           o.shipping_paise as shipping, o.total_paise as total, o.status
    from shop.invoices i join shop.orders o on o.id = i.order_id
    where ${sql.unsafe(IST("i.issued_at"))} between ${r.from}::date and ${r.to}::date
    order by i.issued_at, i.invoice_number limit ${limit}`;
}

export interface CreditNoteRow { number: string; issuedAt: Date; invoiceNumber: string; orderNumber: string; orderId: string; reason: string; taxable: number; cgst: number; sgst: number; igst: number; other: number; total: number }
export async function creditNoteRegister(r: DateRange, limit = 1000): Promise<CreditNoteRow[]> {
  const sql = db();
  return sql<CreditNoteRow[]>`
    select c.credit_note_number as number, c.issued_at as "issuedAt", i.invoice_number as "invoiceNumber", o.order_number as "orderNumber", o.id as "orderId",
           c.reason, c.taxable_paise as taxable, c.cgst_paise as cgst, c.sgst_paise as sgst, c.igst_paise as igst, c.other_paise as other, c.total_paise as total
    from shop.credit_notes c join shop.invoices i on i.id = c.invoice_id join shop.orders o on o.id = c.order_id
    where ${sql.unsafe(IST("c.issued_at"))} between ${r.from}::date and ${r.to}::date
    order by c.issued_at, c.credit_note_number limit ${limit}`;
}

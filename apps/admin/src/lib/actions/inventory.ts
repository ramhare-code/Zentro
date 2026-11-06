"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TransactionSql } from "@zentro/commerce/db";
import { audit } from "../audit";
import { revalidateStorefront } from "../catalog-admin";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);

// ------------------------------------------------------------------ suppliers

export async function saveSupplierAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("suppliers.manage");
    const id = z.guid().safeParse(f.get("supplierId")).data ?? null;
    const name = str(f, "name", 120);
    if (name.length < 2) throw new UserError("Enter the supplier’s name.");
    const email = str(f, "email", 200).toLowerCase() || null;
    if (email && !z.string().email().safeParse(email).success) throw new UserError("Enter a valid email or leave it blank.");
    const gstin = str(f, "gstin", 15).toUpperCase() || null;
    if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) throw new UserError("GSTIN should be 15 characters, starting with the 2-digit state code.");
    const lead = str(f, "leadTimeDays") ? z.coerce.number().int().min(0).max(365).safeParse(str(f, "leadTimeDays")).data : null;
    if (lead === undefined) throw new UserError("Lead time is a number of days (0–365).");
    const row = {
      name, contact_name: str(f, "contactName", 100) || null, email, phone: str(f, "phone", 20) || null, gstin,
      address: str(f, "address", 500) || null, payment_terms: str(f, "paymentTerms", 100) || null, lead_time_days: lead,
      notes: str(f, "notes", 2000) || null, is_active: f.get("isActive") !== null ? f.get("isActive") === "on" : true,
    };
    const sql = db();
    const [dupe] = await sql`select 1 from shop.suppliers where lower(name) = lower(${name}) and id is distinct from ${id}`;
    if (dupe) throw new UserError("A supplier with this name already exists.");
    if (id) await sql`update shop.suppliers set ${sql(row)} where id = ${id}`;
    else await sql`insert into shop.suppliers ${sql(row)}`;
    await audit(s, { action: id ? "supplier.update" : "supplier.create", entityType: "supplier", entityId: id ?? name, details: { name } });
    revalidatePath("/suppliers");
    return { ok: true, message: id ? "Supplier saved." : "Supplier added." };
  });
}

// ------------------------------------------------------------------ purchase orders

/** "SKU, quantity, unit cost" per line → validated purchase lines. */
async function parseLines(tx: TransactionSql | ReturnType<typeof db>, text: string) {
  const lines: { variantId: string; qty: number; cost: number }[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [n, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    // tab-separated (pasted from a spreadsheet) or comma-separated; the cost may itself contain thousands commas
    const parts = (line.includes("\t") ? line.split("\t") : line.split(",")).map((x) => x.trim());
    const [skuRaw, qtyRaw] = parts, costRaw = parts.slice(2).join(line.includes("\t") ? "" : ",");
    if (costRaw.includes(",") && !/^₹?\s*\d{1,3}(,\d{2,3})*(\.\d{1,2})?$/.test(costRaw)) { errors.push(`Line ${n + 1}: use “SKU, quantity, unit cost”.`); continue; }
    const sku = (skuRaw ?? "").toUpperCase();
    const qty = Number(qtyRaw), cost = Math.round(Number((costRaw ?? "").replace(/[₹,\s]/g, "")) * 100);
    if (!sku || !Number.isInteger(qty) || qty < 1 || !Number.isFinite(cost) || cost < 0) { errors.push(`Line ${n + 1}: use “SKU, quantity, unit cost”.`); continue; }
    if (seen.has(sku)) { errors.push(`Line ${n + 1}: ${sku} is listed twice.`); continue; }
    const [v] = await tx<{ id: string }[]>`select id from shop.product_variants where sku = ${sku}`;
    if (!v) { errors.push(`Line ${n + 1}: no variant with SKU ${sku}.`); continue; }
    seen.add(sku);
    lines.push({ variantId: v.id, qty, cost });
  }
  if (errors.length) throw new UserError(errors.slice(0, 8).join(" "));
  if (!lines.length) throw new UserError("Add at least one line: “SKU, quantity, unit cost”.");
  if (lines.length > 300) throw new UserError("Up to 300 lines per purchase order.");
  return lines;
}

export async function createPurchaseOrderAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("purchase_orders.manage");
    const supplierId = z.guid().safeParse(f.get("supplierId")).data;
    if (!supplierId) throw new UserError("Choose a supplier.");
    const expected = z.string().date().safeParse(str(f, "expectedDate")).data ?? null;
    const sql = db();
    const id = await sql.begin(async (tx) => {
      const [sup] = await tx`select 1 from shop.suppliers where id = ${supplierId} and is_active`;
      if (!sup) throw new UserError("That supplier is archived or missing.");
      const lines = await parseLines(tx, str(f, "lines", 30000));
      const [{ n }] = (await tx<{ n: string }[]>`select nextval('shop.po_number_seq')::text as n`) as unknown as [{ n: string }];
      const [po] = await tx<{ id: string }[]>`
        insert into shop.purchase_orders (po_number, supplier_id, expected_date, notes, created_by)
        values (${"PO-" + n}, ${supplierId}, ${expected}, ${str(f, "notes", 2000) || null}, ${s.staffId}) returning id`;
      for (const l of lines) await tx`insert into shop.purchase_order_items (po_id, variant_id, quantity_ordered, unit_cost_paise) values (${po!.id}, ${l.variantId}, ${l.qty}, ${l.cost})`;
      await audit(s, { action: "po.create", entityType: "purchase_order", entityId: po!.id, details: { lines: lines.length } }, tx);
      return po!.id;
    });
    redirect(`/purchase-orders/${id}`);
  });
}

export async function updatePurchaseOrderLinesAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("purchase_orders.manage");
    const id = z.guid().parse(f.get("poId"));
    const sql = db();
    await sql.begin(async (tx) => {
      const [po] = await tx<{ status: string }[]>`select status from shop.purchase_orders where id = ${id} for update`;
      if (po?.status !== "draft") throw new UserError("Only draft purchase orders can be edited.");
      const lines = await parseLines(tx, str(f, "lines", 30000));
      await tx`delete from shop.purchase_order_items where po_id = ${id}`;
      for (const l of lines) await tx`insert into shop.purchase_order_items (po_id, variant_id, quantity_ordered, unit_cost_paise) values (${id}, ${l.variantId}, ${l.qty}, ${l.cost})`;
      await tx`update shop.purchase_orders set expected_date = ${z.string().date().safeParse(str(f, "expectedDate")).data ?? null}, notes = ${str(f, "notes") || null} where id = ${id}`;
      await audit(s, { action: "po.update", entityType: "purchase_order", entityId: id, details: { lines: lines.length } }, tx);
    });
    revalidatePath(`/purchase-orders/${id}`);
    return { ok: true, message: "Purchase order updated." };
  });
}

export async function purchaseOrderStatusAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("purchase_orders.manage");
    const id = z.guid().parse(f.get("poId"));
    const op = z.enum(["order", "cancel", "close"]).parse(f.get("op"));
    const sql = db();
    let message = "";
    await sql.begin(async (tx) => {
      const [po] = await tx<{ status: string; received: number }[]>`
        select status, (select coalesce(sum(quantity_received), 0)::int from shop.purchase_order_items where po_id = ${id}) as received
        from shop.purchase_orders where id = ${id} for update`;
      if (!po) throw new UserError("Purchase order not found.");
      if (op === "order") {
        if (po.status !== "draft") throw new UserError("Only drafts can be placed.");
        await tx`update shop.purchase_orders set status = 'ordered', ordered_at = now() where id = ${id}`;
        message = "Marked as ordered. Receive stock against it when it arrives.";
      } else if (op === "cancel") {
        if (!["draft", "ordered"].includes(po.status) || po.received > 0) throw new UserError("Only purchase orders with nothing received can be cancelled. Close it instead.");
        await tx`update shop.purchase_orders set status = 'cancelled', closed_at = now() where id = ${id}`;
        message = "Purchase order cancelled.";
      } else {
        if (po.status !== "partially_received") throw new UserError("Only partly received purchase orders can be closed.");
        await tx`update shop.purchase_orders set status = 'closed', closed_at = now() where id = ${id}`;
        message = "Closed — the remaining quantity is no longer expected.";
      }
      await audit(s, { action: `po.${op}`, entityType: "purchase_order", entityId: id }, tx);
    });
    revalidatePath(`/purchase-orders/${id}`);
    return { ok: true, message };
  });
}

/** Receives stock against a purchase order: adds stock, logs movements, records the unit cost. */
export async function receivePurchaseOrderAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("inventory.adjust");
    await authorize("purchase_orders.manage");
    const id = z.guid().parse(f.get("poId"));
    const note = str(f, "note", 300) || null;
    const sql = db();
    const result = await sql.begin(async (tx) => {
      const [po] = await tx<{ status: string; number: string }[]>`select status, po_number as number from shop.purchase_orders where id = ${id} for update`;
      if (!po || !["ordered", "partially_received"].includes(po.status)) throw new UserError("Only placed purchase orders can be received.");
      const items = await tx<{ id: string; variantId: string; sku: string; ordered: number; received: number; cost: number }[]>`
        select i.id, i.variant_id as "variantId", v.sku, i.quantity_ordered as ordered, i.quantity_received as received, i.unit_cost_paise as cost
        from shop.purchase_order_items i join shop.product_variants v on v.id = i.variant_id where i.po_id = ${id} order by v.sku for update of i`;
      let units = 0;
      for (const it of items) {
        const raw = str(f, `recv:${it.id}`, 10);
        if (!raw) continue;
        const q = Number(raw);
        if (!Number.isInteger(q) || q < 0) throw new UserError(`${it.sku}: enter a whole number.`);
        if (q === 0) continue;
        if (q > it.ordered - it.received) throw new UserError(`${it.sku}: only ${it.ordered - it.received} still expected — you entered ${q}.`);
        const [v] = await tx<{ stock: number }[]>`update shop.product_variants set stock = stock + ${q}, cost_paise = ${it.cost} where id = ${it.variantId} returning stock`;
        await tx`update shop.purchase_order_items set quantity_received = quantity_received + ${q} where id = ${it.id}`;
        await tx`insert into shop.stock_movements (variant_id, delta, stock_after, reason, note, reference, staff_id)
                 values (${it.variantId}, ${q}, ${v!.stock}, 'received', ${note}, ${po.number}, ${s.staffId})`;
        units += q;
      }
      if (!units) throw new UserError("Enter the quantity received for at least one line.");
      const [left] = await tx<{ n: number }[]>`select coalesce(sum(quantity_ordered - quantity_received), 0)::int as n from shop.purchase_order_items where po_id = ${id}`;
      const status = left!.n === 0 ? "received" : "partially_received";
      await tx`update shop.purchase_orders set status = ${status}, received_at = case when ${status} = 'received' then now() else received_at end where id = ${id}`;
      await audit(s, { action: "po.receive", entityType: "purchase_order", entityId: id, details: { units, status } }, tx);
      return { units, status, number: po.number };
    });
    revalidatePath(`/purchase-orders/${id}`);
    revalidatePath("/inventory");
    await revalidateStorefront(["/", "/categories"]);
    return { ok: true, message: `Received ${result.units} unit(s) against ${result.number}. ${result.status === "received" ? "Purchase order complete." : "Some items are still expected."}` };
  });
}

// ------------------------------------------------------------------ stock counts

export async function startCountAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("inventory.adjust");
    const title = str(f, "title", 120) || `Stock count ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`;
    const categoryId = z.guid().safeParse(f.get("categoryId")).data ?? null;
    const sql = db();
    const id = await sql.begin(async (tx) => {
      const [c] = await tx<{ id: string }[]>`insert into shop.stock_counts (title, category_id, created_by) values (${title}, ${categoryId}, ${s.staffId}) returning id`;
      const r = await tx`
        insert into shop.stock_count_lines (count_id, variant_id, expected)
        select ${c!.id}, v.id, v.stock from shop.product_variants v join shop.products p on p.id = v.product_id
        where v.is_active and p.archived_at is null
          ${categoryId ? tx`and p.category_id in (with recursive t as (select id from shop.categories where id = ${categoryId} union all select k.id from shop.categories k join t on k.parent_id = t.id) select id from t)` : tx``}`;
      if (!r.count) throw new UserError("No active variants in that category.");
      await audit(s, { action: "stock_count.start", entityType: "stock_count", entityId: c!.id, details: { title, lines: r.count } }, tx);
      return c!.id;
    });
    redirect(`/inventory/counts/${id}`);
  });
}

export async function saveCountAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("inventory.adjust");
    const id = z.guid().parse(f.get("countId"));
    const sql = db();
    let saved = 0;
    await sql.begin(async (tx) => {
      const [c] = await tx<{ status: string }[]>`select status from shop.stock_counts where id = ${id} for update`;
      if (c?.status !== "open") throw new UserError("This count is no longer open.");
      for (const [k, v] of f.entries()) {
        if (!k.startsWith("count:")) continue;
        const variantId = z.guid().safeParse(k.slice(6)).data;
        const raw = String(v).trim();
        if (!variantId) continue;
        const counted = raw === "" ? null : Number(raw);
        if (counted !== null && (!Number.isInteger(counted) || counted < 0 || counted > 1_000_000)) throw new UserError("Counts must be whole numbers.");
        await tx`update shop.stock_count_lines set counted = ${counted} where count_id = ${id} and variant_id = ${variantId}`;
        saved++;
      }
      await audit(s, { action: "stock_count.save", entityType: "stock_count", entityId: id, details: { lines: saved } }, tx);
    });
    revalidatePath(`/inventory/counts/${id}`);
    return { ok: true, message: "Counts saved. Review the differences, then apply." };
  });
}

/**
 * Applies a count: each counted line changes stock by (counted − expected),
 * logged as a reconciliation movement. Uncounted lines are left alone.
 */
export async function applyCountAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("inventory.adjust", { recentAuth: true });
    const id = z.guid().parse(f.get("countId"));
    const op = f.get("op") === "cancel" ? "cancel" : "apply";
    const sql = db();
    const r = await sql.begin(async (tx) => {
      const [c] = await tx<{ status: string; title: string }[]>`select status, title from shop.stock_counts where id = ${id} for update`;
      if (c?.status !== "open") throw new UserError("This count is no longer open.");
      if (op === "cancel") {
        await tx`update shop.stock_counts set status = 'cancelled' where id = ${id}`;
        await audit(s, { action: "stock_count.cancel", entityType: "stock_count", entityId: id }, tx);
        return { changed: 0, units: 0, clamped: 0 };
      }
      const lines = await tx<{ variantId: string; expected: number; counted: number }[]>`
        select variant_id as "variantId", expected, counted from shop.stock_count_lines
        where count_id = ${id} and counted is not null and counted <> expected order by variant_id`;
      let units = 0, clamped = 0;
      for (const l of lines) {
        const [v] = await tx<{ stock: number }[]>`select stock from shop.product_variants where id = ${l.variantId} for update`;
        const wanted = l.counted - l.expected;
        const after = Math.max(0, v!.stock + wanted);
        const delta = after - v!.stock;
        if (delta !== wanted) clamped++;
        if (delta !== 0) {
          await tx`update shop.product_variants set stock = ${after} where id = ${l.variantId}`;
          await tx`insert into shop.stock_movements (variant_id, delta, stock_after, reason, note, reference, staff_id)
                   values (${l.variantId}, ${delta}, ${after}, 'reconciliation', ${`Count: expected ${l.expected}, counted ${l.counted}`}, ${c.title.slice(0, 100)}, ${s.staffId})`;
        }
        await tx`update shop.stock_count_lines set applied_delta = ${delta} where count_id = ${id} and variant_id = ${l.variantId}`;
        units += Math.abs(delta);
      }
      await tx`update shop.stock_counts set status = 'applied', applied_at = now(), applied_by = ${s.staffId} where id = ${id}`;
      await audit(s, { action: "stock_count.apply", entityType: "stock_count", entityId: id, details: { changed: lines.length, units, clamped } }, tx);
      return { changed: lines.length, units, clamped };
    });
    revalidatePath(`/inventory/counts/${id}`);
    revalidatePath("/inventory");
    if (op === "apply") await revalidateStorefront(["/", "/categories"]);
    return {
      ok: true,
      message: op === "cancel" ? "Count cancelled; stock unchanged."
        : `Applied: ${r.changed} variant(s) corrected (${r.units} unit(s)).${r.clamped ? ` ${r.clamped} line(s) would have gone below zero and were set to 0.` : ""}`,
    };
  });
}

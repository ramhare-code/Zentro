"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { processWebhookEvent, syncPaymentWithGateway, type SyncOutcome } from "@zentro/commerce/payments";
import { razorpayConfigFromEnv } from "@zentro/commerce/razorpay";
import { audit } from "../audit";
import { parseCsv } from "../csv";
import { db } from "../db";
import { authorize } from "../session";
import { parseSettlementReport } from "../settlement";
import { guarded, UserError, type ActionResult } from "./result";

const gateway = () => {
  const cfg = razorpayConfigFromEnv();
  if (!cfg) throw new UserError("Razorpay isn’t configured on the admin site (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
  return cfg;
};

const OUTCOME_TEXT = (o: SyncOutcome) => {
  switch (o.outcome) {
    case "confirmed": return `Razorpay shows this payment captured. Order ${o.orderNumber} is now confirmed.`;
    case "already_paid": return `Razorpay agrees: captured, and order ${o.orderNumber} is already confirmed. Fees updated.`;
    case "duplicate_refunded": return `This was a second payment for ${o.orderNumber}, which was already paid. It has been refunded.`;
    case "refunded_stock_unavailable": return `Payment captured after the order had expired and stock was gone; a full refund was issued for ${o.orderNumber}.`;
    case "failed": return `Razorpay reports the payment failed: ${o.detail}`;
    case "pending": return o.detail;
    case "no_payment": return "Razorpay has no payment for this attempt — the customer didn’t complete it.";
    case "needs_review": return o.detail;
  }
};

/** Asks Razorpay for the real status of one payment attempt and applies it through the verified path. */
export async function checkPaymentAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("payments.reconcile");
    const id = z.guid().parse(f.get("paymentId"));
    let r: SyncOutcome;
    try { r = await syncPaymentWithGateway(db(), gateway(), id); }
    catch (e) { if (e instanceof UserError) throw e; console.error(e); throw new UserError("Couldn’t reach Razorpay. Try again in a minute."); }
    await audit(s, { action: "payment.gateway_check", entityType: "payment", entityId: id, details: { outcome: r.outcome } });
    revalidatePath(`/payments/${id}`);
    return r.outcome === "needs_review" ? { error: OUTCOME_TEXT(r) } : { ok: true, message: OUTCOME_TEXT(r) };
  });
}

/** Re-runs a stored webhook event that failed to process (idempotent: confirmation and refunds can't double-apply). */
export async function retryWebhookAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("payments.reconcile");
    const id = z.coerce.number().int().positive().parse(f.get("eventId"));
    const sql = db();
    const [ev] = await sql<{ processed: boolean }[]>`
      update shop.payment_webhook_events set attempts = attempts + 1, retried_by = ${s.staffId} where id = ${id} returning processed_at is not null as processed`;
    if (!ev) throw new UserError("Event not found.");
    if (ev.processed) throw new UserError("This event was already processed.");
    const r = await processWebhookEvent(sql, gateway(), id);
    await audit(s, { action: "payment.webhook_retry", entityType: "webhook_event", entityId: String(id), details: { ok: r.ok } });
    revalidatePath("/payments/webhooks");
    return r.ok ? { ok: true, message: "Processed successfully." } : { error: `Still failing: ${r.error}` };
  });
}

export type SettlementResult = (NonNullable<ActionResult> & {
  preview?: {
    lines: number; payments: number; refunds: number; other: number; matched: number; feesPaise: number; settledPaise: number;
    problems: { entityId: string; kind: "amount_mismatch" | "status_mismatch" | "unknown"; detail: string }[]; errors: string[];
  };
}) | undefined;

/** Two-step settlement import: "preview" matches every line; "commit" records fees and settlement ids. */
export async function settlementImportAction(_p: SettlementResult, f: FormData): Promise<SettlementResult> {
  return (await guarded(async () => {
    const s = await authorize("payments.reconcile");
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose the CSV report downloaded from Razorpay.");
    if (file.size > 5 * 1024 * 1024) throw new UserError("Reports can be up to 5 MB. Download a shorter date range.");
    const unit = f.get("unit") === "paise" ? "paise" : "rupees";
    let rows: string[][];
    try { rows = parseCsv(await file.text()); } catch { throw new UserError("This file isn’t valid CSV."); }
    if (rows.length > 20_001) throw new UserError("Up to 20,000 rows per import.");
    const { lines, errors } = parseSettlementReport(rows, unit);
    if (!lines.length && errors.length) throw new UserError(errors.join(" "));
    const sql = db();
    const payIds = lines.filter((l) => l.type === "payment").map((l) => l.entityId);
    const refIds = lines.filter((l) => l.type === "refund").map((l) => l.entityId);
    const [pays, refs] = await Promise.all([
      sql<{ id: string; providerPaymentId: string; amount: number; status: string; orderNumber: string }[]>`
        select p.id, p.provider_payment_id as "providerPaymentId", p.amount_paise as amount, p.status, o.order_number as "orderNumber"
        from shop.payments p join shop.orders o on o.id = p.order_id where p.provider_payment_id = any(${payIds}::text[])`,
      sql<{ id: string; providerRefundId: string; amount: number; status: string }[]>`
        select id, provider_refund_id as "providerRefundId", amount_paise as amount, status from shop.refunds where provider_refund_id = any(${refIds}::text[])`,
    ]);
    const problems: NonNullable<NonNullable<SettlementResult>["preview"]>["problems"] = [];
    const matchedPays: { id: string; line: (typeof lines)[number] }[] = [], matchedRefs: { id: string; line: (typeof lines)[number] }[] = [];
    for (const l of lines) {
      if (l.type === "payment") {
        const p = pays.find((x) => x.providerPaymentId === l.entityId);
        if (!p) problems.push({ entityId: l.entityId, kind: "unknown", detail: "In the report but not in Zentro — check it in the Razorpay dashboard." });
        else if (p.amount !== l.amountPaise) problems.push({ entityId: l.entityId, kind: "amount_mismatch", detail: `${p.orderNumber}: Zentro ₹${(p.amount / 100).toFixed(2)}, report ₹${(l.amountPaise / 100).toFixed(2)}` });
        else if (!["captured", "refunded", "partially_refunded"].includes(p.status)) problems.push({ entityId: l.entityId, kind: "status_mismatch", detail: `${p.orderNumber}: Razorpay settled it but Zentro shows “${p.status}”. Run a gateway check on it.` });
        else matchedPays.push({ id: p.id, line: l });
      } else if (l.type === "refund") {
        const r = refs.find((x) => x.providerRefundId === l.entityId);
        if (!r) problems.push({ entityId: l.entityId, kind: "unknown", detail: "Refund not found in Zentro." });
        else if (r.amount !== l.amountPaise) problems.push({ entityId: l.entityId, kind: "amount_mismatch", detail: `Refund: Zentro ₹${(r.amount / 100).toFixed(2)}, report ₹${(l.amountPaise / 100).toFixed(2)}` });
        else matchedRefs.push({ id: r.id, line: l });
      }
    }
    const preview = {
      lines: lines.length, payments: payIds.length, refunds: refIds.length, other: lines.length - payIds.length - refIds.length,
      matched: matchedPays.length + matchedRefs.length,
      feesPaise: lines.reduce((a, l) => a + (l.type === "payment" ? l.feePaise ?? 0 : 0), 0),
      settledPaise: lines.reduce((a, l) => a + (l.type === "payment" ? l.amountPaise - (l.feePaise ?? 0) : l.type === "refund" ? -l.amountPaise : 0), 0),
      problems: problems.slice(0, 100), errors,
    };
    if (f.get("mode") !== "commit") return { ok: true, preview };

    await sql.begin(async (tx) => {
      for (const m of matchedPays) {
        await tx`update shop.payments set fee_paise = coalesce(${m.line.feePaise}, fee_paise), gateway_tax_paise = coalesce(${m.line.taxPaise}, gateway_tax_paise),
                 settlement_id = coalesce(${m.line.settlementId}, settlement_id), settled_at = coalesce(${m.line.settledAt}, settled_at, now()) where id = ${m.id}`;
      }
      for (const m of matchedRefs) await tx`update shop.refunds set settlement_id = coalesce(${m.line.settlementId}, settlement_id) where id = ${m.id}`;
      const unknown = problems.filter((p) => p.kind === "unknown").length;
      await tx`insert into shop.settlement_imports (file_name, rows_total, matched, mismatched, unknown, fees_paise, settled_paise, created_by)
               values (${file.name.slice(0, 200)}, ${lines.length}, ${preview.matched}, ${problems.length - unknown}, ${unknown}, ${preview.feesPaise}, ${preview.settledPaise}, ${s.staffId})`;
      await audit(s, { action: "payment.settlement_import", details: { file: file.name.slice(0, 200), lines: lines.length, matched: preview.matched, problems: problems.length } }, tx);
    });
    revalidatePath("/payments/reconcile");
    return { ok: true, preview, message: `Recorded ${preview.matched} matched line(s). ${problems.length ? `${problems.length} line(s) need attention — they were not changed.` : "Everything matched."}` };
  })) as SettlementResult;
}

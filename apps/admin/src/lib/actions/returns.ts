"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { applyRefundStatus, CheckoutError, receiveReturn, updateReturn } from "@zentro/commerce/orders";
import { razorpay, razorpayConfigFromEnv } from "@zentro/commerce/razorpay";
import { formatPaise } from "@zentro/commerce";
import { audit } from "../audit";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const wrap = (e: unknown): never => { if (e instanceof CheckoutError) throw new UserError(e.message); throw e; };

async function submitRefund(refundId: string): Promise<string> {
  const cfg = razorpayConfigFromEnv();
  if (!cfg) return " Razorpay isn’t configured on the admin, so the refund is saved as pending — issue it from Refunds once keys are set.";
  const sql = db();
  const [r] = await sql<{ amount: number; providerPaymentId: string; orderId: string }[]>`
    select f.amount_paise as amount, p.provider_payment_id as "providerPaymentId", f.order_id as "orderId"
    from shop.refunds f join shop.payments p on p.id = f.payment_id where f.id = ${refundId} and f.provider_refund_id is null`;
  if (!r) return "";
  try {
    const rf = await razorpay.refund(cfg, r.providerPaymentId, r.amount, { order_id: r.orderId }, refundId.slice(0, 40));
    await applyRefundStatus(sql, refundId, rf.id, rf.status);
    return rf.status === "processed" ? ` Refund of ${formatPaise(r.amount)} processed by Razorpay.` : ` Refund of ${formatPaise(r.amount)} submitted to Razorpay (pending).`;
  } catch (e) {
    console.error(e);
    await sql`update shop.refunds set status = 'failed' where id = ${refundId}`;
    return " Razorpay rejected the refund request — it’s marked failed; retry from Refunds.";
  }
}

export async function returnAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const returnId = z.guid().parse(form.get("returnId"));
    const op = z.enum(["approved", "rejected", "pickup_scheduled", "picked_up", "receive"]).parse(form.get("op"));
    const note = String(form.get("note") ?? "").trim().slice(0, 500) || undefined;
    if (op === "receive") {
      const s = await authorize("refunds.create", { recentAuth: true });
      const refund = await receiveReturn(db(), returnId).catch(wrap);
      const extra = refund ? await submitRefund(refund.refundId) : " No captured payment to refund.";
      await audit(s, { action: "return.receive", entityType: "return", entityId: returnId, details: { refundPaise: refund?.amountPaise ?? 0 } });
      revalidatePath("/orders");
      return { ok: true, message: "Items received and restocked." + extra };
    }
    const s = await authorize("orders.update");
    if (op === "rejected" && !note) throw new UserError("Tell the customer why the return isn’t approved.");
    await updateReturn(db(), returnId, op, note).catch(wrap);
    await audit(s, { action: `return.${op}`, entityType: "return", entityId: returnId, details: { note } });
    revalidatePath("/orders");
    return { ok: true, message: `Return marked ${op.replace(/_/g, " ")}. The customer has been notified.` };
  });
}

export async function retryRefundAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("refunds.create", { recentAuth: true });
    const refundId = z.guid().parse(form.get("refundId"));
    const sql = db();
    const [r] = await sql<{ status: string; provider: string | null }[]>`select status, provider_refund_id as provider from shop.refunds where id = ${refundId}`;
    if (!r) throw new UserError("Refund not found.");
    if (r.provider && r.status !== "failed") throw new UserError("This refund was already accepted by Razorpay.");
    await sql`update shop.refunds set status = 'pending', provider_refund_id = null where id = ${refundId}`;
    const msg = await submitRefund(refundId);
    await audit(s, { action: "refund.retry", entityType: "refund", entityId: refundId });
    revalidatePath("/refunds");
    return { ok: true, message: msg.trim() || "Submitted." };
  });
}

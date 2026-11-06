"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORDER_STATUSES, type OrderStatus } from "@zentro/commerce";
import { advanceOrder, applyRefundStatus, cancelOrder, CheckoutError } from "@zentro/commerce/orders";
import { razorpay, razorpayConfigFromEnv } from "@zentro/commerce/razorpay";
import { audit } from "../audit";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const id = z.guid();

function wrap(e: unknown): never {
  if (e instanceof CheckoutError) throw new UserError(e.message);
  throw e;
}

export async function advanceOrderAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("orders.update");
    const orderId = id.parse(form.get("orderId"));
    const to = z.enum(ORDER_STATUSES).parse(form.get("to")) as OrderStatus;
    const shipment = to === "shipped"
      ? { carrier: String(form.get("carrier") ?? ""), trackingNumber: String(form.get("trackingNumber") ?? ""), trackingUrl: String(form.get("trackingUrl") ?? "") }
      : undefined;
    const note = String(form.get("note") ?? "").trim() || undefined;
    await advanceOrder(db(), orderId, to, { actor: "operations", note, shipment }).catch(wrap);
    await audit(s, { action: "order.status_change", entityType: "order", entityId: orderId, details: { to, ...(shipment ? { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber } : {}) } });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    return { ok: true, message: `Order marked ${to.replace(/_/g, " ")}.${["shipped", "out_for_delivery", "delivered"].includes(to) ? " The customer notification has been queued." : ""}` };
  });
}

export async function cancelOrderAdminAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("orders.cancel", { recentAuth: true });
    const orderId = id.parse(form.get("orderId"));
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 3) throw new UserError("Enter a reason (it is shown to the customer).");
    const sql = db();
    const r = await cancelOrder(sql, orderId, { actor: "operations", reason }).catch(wrap);
    let message = "Order cancelled and stock returned.";
    if (r.refund) {
      const cfg = razorpayConfigFromEnv();
      if (!cfg) {
        message += " A refund is pending, but Razorpay isn’t configured on the admin — it must be issued manually.";
      } else {
        try {
          const rf = await razorpay.refund(cfg, r.refund.providerPaymentId, r.refund.amountPaise, { order_id: orderId, reason }, r.refund.refundId.slice(0, 40));
          await applyRefundStatus(sql, r.refund.refundId, rf.id, rf.status);
          message += rf.status === "processed" ? " Full refund processed by Razorpay." : " Full refund submitted to Razorpay (pending).";
        } catch (e) {
          console.error(e);
          message += " The refund request to Razorpay failed — it is saved as pending; retry from Refunds.";
        }
      }
    }
    await audit(s, { action: "order.cancel", entityType: "order", entityId: orderId, details: { reason, refund: r.refund?.amountPaise ?? 0 } });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, message };
  });
}

export async function addOrderNoteAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("orders.notes");
    const orderId = id.parse(form.get("orderId"));
    const body = String(form.get("body") ?? "").trim();
    if (!body || body.length > 2000) throw new UserError("Write a note (up to 2000 characters).");
    await db()`insert into shop.order_notes (order_id, staff_id, staff_email, body) values (${orderId}, ${s.staffId}, ${s.email}, ${body})`;
    await audit(s, { action: "order.note_add", entityType: "order", entityId: orderId });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, message: "Note added (visible to staff only)." };
  });
}

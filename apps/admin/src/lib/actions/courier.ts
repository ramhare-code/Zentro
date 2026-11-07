"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CheckoutError } from "@zentro/commerce/orders";
import { bookShipment, CourierError, shiprocketConfigFromEnv, syncTracking } from "@zentro/commerce/shipping";
import { audit } from "../audit";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const courier = () => {
  const cfg = shiprocketConfigFromEnv();
  if (!cfg) throw new UserError("Courier booking isn’t set up. Add SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD and SHIPROCKET_PICKUP_LOCATION, or ship manually with a tracking number.");
  return cfg;
};

export async function bookCourierAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("orders.update");
    const orderId = z.guid().parse(f.get("orderId"));
    const num = (k: string) => Number(String(f.get(k) ?? "").replace(",", "."));
    const pkg = { weightGrams: Math.round(num("weightKg") * 1000), lengthCm: num("lengthCm"), breadthCm: num("breadthCm"), heightCm: num("heightCm") };
    let r;
    try { r = await bookShipment(db(), courier(), orderId, pkg); }
    catch (e) {
      if (e instanceof CourierError || e instanceof CheckoutError) throw new UserError(e.message);
      if (e instanceof UserError) throw e;
      console.error(e);
      throw new UserError(`The courier rejected the booking: ${String((e as Error).message).slice(0, 200)}`);
    }
    await audit(s, { action: "order.courier_booked", entityType: "order", entityId: orderId, details: { awb: r.awb, courier: r.courier, weightGrams: pkg.weightGrams } });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, message: `Booked with ${r.courier ?? "the courier"} — AWB ${r.awb}. The customer has been told it’s shipped.${r.labelUrl ? " Print the courier label from the shipment below." : ""}` };
  });
}

export async function syncTrackingAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("orders.update");
    const orderId = z.guid().parse(f.get("orderId"));
    const sql = db();
    await sql`update shop.shipments set last_synced_at = null where order_id = ${orderId} and provider = 'shiprocket'`;
    const r = await syncTracking(sql, courier(), { limit: 5 });
    await audit(s, { action: "order.tracking_sync", entityType: "order", entityId: orderId, details: r });
    revalidatePath(`/orders/${orderId}`);
    return r.errors ? { error: "Couldn’t reach the courier. Try again shortly." } : { ok: true, message: r.updated ? "Tracking updated." : "No new tracking events yet." };
  });
}

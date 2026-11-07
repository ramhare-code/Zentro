"use server";

import { getSettings } from "../settings";

import { z } from "zod";
import { CheckoutError, findOrderForGuest, requestReturn, type ReturnReason } from "@zentro/commerce/orders";
import { rateLimited } from "../customer";
import { db } from "../db";

export type ReturnResult = { ok?: boolean; error?: string; message?: string } | undefined;
export const returnWindowDays = async () => (await getSettings()).returnWindowDays;

export async function requestReturnAction(_p: ReturnResult, f: FormData): Promise<ReturnResult> {
  const sql = db();
  const orderId = await findOrderForGuest(sql, String(f.get("orderNumber") ?? ""), String(f.get("token") ?? ""));
  if (!orderId) return { error: "We couldn’t verify this order." };
  if (await rateLimited(`return:${orderId}`, 5, 3600)) return { error: "Too many requests. Please try again later." };
  const items = [...f.entries()]
    .filter(([k]) => k.startsWith("qty:"))
    .map(([k, v]) => ({ orderItemId: k.slice(4), quantity: Number(v) || 0 }))
    .filter((i) => z.guid().safeParse(i.orderItemId).success && i.quantity > 0 && i.quantity <= 10);
  try {
    await requestReturn(sql, orderId, {
      items, reason: String(f.get("reason") ?? "") as ReturnReason, details: String(f.get("details") ?? "").trim(), windowDays: await returnWindowDays(),
    });
    return { ok: true, message: "Return requested. We’ll email you as soon as it’s reviewed — usually within one working day." };
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    console.error(e);
    return { error: "We couldn’t submit the request. Please try again." };
  }
}

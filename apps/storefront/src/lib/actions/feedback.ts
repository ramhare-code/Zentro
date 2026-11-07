"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { clientIp, getCustomer, rateLimited } from "../customer";
import { db } from "../db";

type Result = { ok?: boolean; error?: string; message?: string } | undefined;

export async function sendFeedbackAction(_p: Result, f: FormData): Promise<Result> {
  const kind = z.enum(["problem", "suggestion", "praise", "other"]).safeParse(f.get("kind")).data;
  if (!kind) return { error: "Choose what your feedback is about." };
  const message = String(f.get("message") ?? "").trim().slice(0, 2000);
  if (message.length < 5) return { error: "Tell us a little more (at least a few words)." };
  const rating = z.coerce.number().int().min(1).max(5).safeParse(f.get("rating") || undefined).data ?? null;
  const email = String(f.get("email") ?? "").trim().toLowerCase().slice(0, 200) || null;
  if (email && !z.string().email().safeParse(email).success) return { error: "That email address doesn’t look right (or leave it blank)." };
  // honeypot: hidden from people, bots fill it in
  if (String(f.get("website") ?? "")) return { ok: true, message: "Thanks for your feedback." };
  const ipKey = createHash("sha256").update(await clientIp()).digest("hex").slice(0, 32);
  if (await rateLimited(`feedback:${ipKey}`, 5, 3600)) return { error: "You’ve sent a lot of feedback in a short time — please try again later." };
  const page = String(f.get("page") ?? "").slice(0, 300);
  const ua = (await headers()).get("user-agent") ?? "";
  const device = /mobile|android|iphone/i.test(ua) ? "mobile" : /ipad|tablet/i.test(ua) ? "tablet" : "desktop";
  const customer = await getCustomer();
  await db()`insert into shop.site_feedback (kind, rating, message, page_path, email, user_id, device)
             values (${kind}, ${rating}, ${message}, ${page.startsWith("/") ? page : null}, ${email ?? customer?.email ?? null}, ${customer?.id ?? null}, ${device})`;
  return { ok: true, message: email || customer ? "Thanks — we read every message, and we’ll reply if it needs an answer." : "Thanks — we read every message." };
}

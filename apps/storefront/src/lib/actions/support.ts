"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { processOutbox } from "@zentro/commerce/messaging";
import { createTicket, customerReply, TICKET_CATEGORIES, ticketLink, ticketToken, TicketError, verifyTicketToken, type TicketCategory } from "@zentro/commerce/support";
import { clientIp, getCustomer, rateLimited } from "../customer";
import { db } from "../db";
import { providerEnv } from "../messaging-env";
import { siteUrl } from "../site";

export type SupportResult = { ok?: boolean; error?: string; message?: string } | undefined;

export async function ticketSecret() {
  const s = process.env.TICKET_LINK_SECRET;
  if (!s) throw new Error("TICKET_LINK_SECRET is not configured");
  return s;
}

export async function createTicketAction(_p: SupportResult, f: FormData): Promise<SupportResult> {
  const get = (k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
  const name = get("name", 100), email = get("email", 200).toLowerCase(), subject = get("subject", 150), message = get("message", 5000);
  const phoneRaw = get("phone", 20).replace(/\D/g, "").slice(-10);
  const category = get("category", 30) as TicketCategory;
  if (name.length < 2) return { error: "Enter your name." };
  if (!z.string().email().safeParse(email).success) return { error: "Enter a valid email so we can reply." };
  if (phoneRaw && !/^[6-9]\d{9}$/.test(phoneRaw)) return { error: "Enter a valid 10-digit mobile number, or leave it blank." };
  if (!(category in TICKET_CATEGORIES)) return { error: "Choose what your request is about." };
  if (subject.length < 3) return { error: "Add a short subject." };
  if (message.length < 10) return { error: "Tell us a little more (at least 10 characters)." };
  if (await rateLimited(`ticket:${await clientIp()}`, 5, 3600) || await rateLimited(`ticket:${email}`, 5, 3600)) return { error: "You’ve sent several requests recently. Please wait before sending another." };
  const secret = await ticketSecret();
  let number: string;
  try {
    const t = await createTicket(db(), {
      name, email, phone: phoneRaw || null, orderNumber: get("orderNumber", 30) || null, category, subject, message, userId: (await getCustomer())?.id ?? null,
    }, (n) => ticketLink(siteUrl("/"), secret, n));
    number = t.ticketNumber;
    // send this ticket's confirmation now, independent of any queue backlog
    const ids = await db()<{ id: string }[]>`select id::text from shop.notification_outbox where dedupe_key = ${"ticket_created:" + t.id}`;
    await processOutbox(db(), providerEnv(), { onlyIds: ids.map((r) => r.id) }).catch((e) => console.error(e));
  } catch (e) {
    if (e instanceof TicketError) return { error: e.message };
    throw e;
  }
  redirect(`/support/${number}?t=${ticketToken(secret, number)}&new=1`);
}

export async function replyTicketAction(_p: SupportResult, f: FormData): Promise<SupportResult> {
  const number = String(f.get("ticketNumber") ?? "");
  const token = String(f.get("token") ?? "");
  const body = String(f.get("body") ?? "").trim().slice(0, 5000);
  if (!verifyTicketToken(await ticketSecret(), number, token)) return { error: "This link isn’t valid." };
  if (body.length < 2) return { error: "Write a message." };
  if (await rateLimited(`ticket-reply:${number}`, 20, 3600)) return { error: "Too many messages. Please wait a little." };
  const [t] = await db()<{ id: string }[]>`select id from shop.support_tickets where ticket_number = ${number}`;
  if (!t) return { error: "Ticket not found." };
  await customerReply(db(), t.id, body);
  redirect(`/support/${number}?t=${token}`);
}

// Customer care tickets (server-side only).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql, TransactionSql } from "./db";

export const TICKET_CATEGORIES = {
  order: "An order", payment: "Payment", delivery: "Delivery", return_refund: "Return or refund",
  product: "A product", account: "My account", other: "Something else",
} as const;
export type TicketCategory = keyof typeof TICKET_CATEGORIES;
export type TicketStatus = "open" | "in_progress" | "awaiting_customer" | "resolved" | "closed";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open", in_progress: "In progress", awaiting_customer: "Waiting for your reply", resolved: "Resolved", closed: "Closed",
};

/** Stable per-ticket secret link token (no storage needed; changes if the secret rotates). */
export function ticketToken(secret: string, ticketNumber: string): string {
  return createHmac("sha256", secret).update(`ticket|${ticketNumber}`).digest("base64url").slice(0, 32);
}
export function verifyTicketToken(secret: string, ticketNumber: string, token: string): boolean {
  const a = Buffer.from(ticketToken(secret, ticketNumber)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function ticketLink(siteUrl: string, secret: string, ticketNumber: string) {
  return `${siteUrl.replace(/\/$/, "")}/support/${ticketNumber}?t=${ticketToken(secret, ticketNumber)}`;
}

async function notify(tx: TransactionSql, ticketId: string, template: "ticket_created" | "ticket_reply", extra: Record<string, string>, dedupe: string) {
  const [t] = await tx<{ email: string; name: string; number: string }[]>`select email, name, ticket_number as number from shop.support_tickets where id = ${ticketId}`;
  if (!t) return;
  await tx`insert into shop.notification_outbox (channel, recipient, template, kind, payload, dedupe_key)
           values ('email', ${t.email}, ${template}, 'transactional', ${tx.json({ name: t.name.split(" ")[0], ticketNumber: t.number, ...extra } as never)}, ${dedupe})
           on conflict (dedupe_key) do nothing`;
}

export class TicketError extends Error {}

export async function createTicket(
  sql: Sql,
  input: { name: string; email: string; phone?: string | null; orderNumber?: string | null; category: TicketCategory; subject: string; message: string; userId?: string | null },
  link: (ticketNumber: string) => string,
): Promise<{ id: string; ticketNumber: string }> {
  if (!(input.category in TICKET_CATEGORIES)) throw new TicketError("Choose what your request is about.");
  return sql.begin(async (tx) => {
    let orderId: string | null = null;
    if (input.orderNumber) {
      const [o] = await tx<{ id: string }[]>`select id from shop.orders where order_number = ${input.orderNumber.toUpperCase()} and lower(email) = ${input.email.toLowerCase()}`;
      if (!o) throw new TicketError("We couldn’t find that order number for this email. Leave it blank if you’re not sure.");
      orderId = o.id;
    }
    const [n] = await tx<{ n: string }[]>`select nextval('shop.ticket_number_seq')::text as n`;
    const ticketNumber = `ZT${n!.n}`;
    const priority = input.category === "payment" ? "high" : "normal";
    const [t] = await tx<{ id: string }[]>`
      insert into shop.support_tickets (ticket_number, user_id, name, email, phone, order_id, category, subject, priority, last_customer_message_at)
      values (${ticketNumber}, ${input.userId ?? null}, ${input.name}, ${input.email.toLowerCase()}, ${input.phone ?? null}, ${orderId}, ${input.category}, ${input.subject}, ${priority}, now())
      returning id`;
    await tx`insert into shop.ticket_messages (ticket_id, author, body) values (${t!.id}, 'customer', ${input.message})`;
    await notify(tx, t!.id, "ticket_created", { actionLink: link(ticketNumber) }, `ticket_created:${t!.id}`);
    return { id: t!.id, ticketNumber };
  });
}

export async function customerReply(sql: Sql, ticketId: string, body: string) {
  await sql.begin(async (tx) => {
    await tx`insert into shop.ticket_messages (ticket_id, author, body) values (${ticketId}, 'customer', ${body})`;
    await tx`update shop.support_tickets set last_customer_message_at = now(),
             status = case when status in ('awaiting_customer','resolved','closed') then 'open' else status end where id = ${ticketId}`;
  });
}

export async function staffReply(
  sql: Sql, ticketId: string, staff: { staffId: string },
  input: { body?: string; internal: boolean; status?: TicketStatus; priority?: string; assignTo?: string | null },
  link: (ticketNumber: string) => string,
) {
  await sql.begin(async (tx) => {
    const [t] = await tx<{ number: string }[]>`select ticket_number as number from shop.support_tickets where id = ${ticketId} for update`;
    if (!t) throw new TicketError("Ticket not found.");
    if (input.body) {
      const [m] = await tx<{ id: string }[]>`
        insert into shop.ticket_messages (ticket_id, author, body, staff_id, internal) values (${ticketId}, 'support', ${input.body}, ${staff.staffId}, ${input.internal}) returning id::text`;
      if (!input.internal) {
        await tx`update shop.support_tickets set last_staff_message_at = now(), status = case when status = 'open' then 'awaiting_customer' else status end where id = ${ticketId}`;
        await notify(tx, ticketId, "ticket_reply", { message: input.body.slice(0, 1500), actionLink: link(t.number) }, `ticket_reply:${m!.id}`);
      }
    }
    if (input.status) await tx`update shop.support_tickets set status = ${input.status} where id = ${ticketId}`;
    if (input.priority) await tx`update shop.support_tickets set priority = ${input.priority} where id = ${ticketId}`;
    if (input.assignTo !== undefined) await tx`update shop.support_tickets set assigned_to = ${input.assignTo} where id = ${ticketId}`;
  });
}

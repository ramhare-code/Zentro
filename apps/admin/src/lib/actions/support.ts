"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { processOutbox } from "@zentro/commerce/messaging";
import { staffReply, ticketLink, TicketError } from "@zentro/commerce/support";
import { audit } from "../audit";
import { db } from "../db";
import { providerEnv } from "../messaging-env";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

export async function ticketAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("support.manage");
    const ticketId = z.guid().parse(form.get("ticketId"));
    const body = String(form.get("body") ?? "").trim().slice(0, 5000) || undefined;
    const internal = form.get("internal") === "on";
    const status = z.enum(["open", "in_progress", "awaiting_customer", "resolved", "closed"]).safeParse(form.get("status")).data;
    const priority = z.enum(["low", "normal", "high", "urgent"]).safeParse(form.get("priority")).data;
    const assignRaw = form.get("assignTo");
    const assignTo = assignRaw === null ? undefined : assignRaw === "" ? null : z.guid().parse(assignRaw);
    if (assignTo) {
      const [ok] = await db()`select 1 from shop.staff_users u join shop.admin_roles r on r.id = u.role_id where u.id = ${assignTo} and u.status = 'active' and 'support.manage' = any(r.permissions)`;
      if (!ok) throw new UserError("That staff member can’t handle support tickets.");
    }
    const secret = process.env.TICKET_LINK_SECRET;
    if (body && !internal && !secret) throw new UserError("TICKET_LINK_SECRET isn’t configured, so the customer couldn’t open the reply link.");
    await staffReply(db(), ticketId, s, { body, internal, status, priority, assignTo }, (n) => ticketLink(process.env.STOREFRONT_URL ?? "", secret ?? "", n))
      .catch((e) => { if (e instanceof TicketError) throw new UserError(e.message); throw e; });
    await audit(s, { action: "ticket.update", entityType: "ticket", entityId: ticketId, details: { replied: !!body, internal, status, priority, assignTo } });
    if (body && !internal) {
      const ids = await db()<{ id: string }[]>`
        select o.id::text from shop.notification_outbox o join shop.support_tickets t on t.ticket_number = o.payload->>'ticketNumber'
        where t.id = ${ticketId} and o.template = 'ticket_reply' and o.status = 'queued'`;
      await processOutbox(db(), providerEnv(), { onlyIds: ids.map((r) => r.id) }).catch((e) => console.error(e));
    }
    revalidatePath(`/support/${ticketId}`);
    return { ok: true, message: body ? (internal ? "Internal note added." : "Reply sent to the customer by email.") : "Ticket updated." };
  });
}

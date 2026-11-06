"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  audienceRecipients, costPerMessage, getMessagingSettings, normaliseRecipient, processOutbox, unknownVariables, withdrawConsent,
  type Audience, type Channel,
} from "@zentro/commerce/messaging";
import { audit } from "../audit";
import { db } from "../db";
import { providerEnv } from "../messaging-env";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const channel = z.enum(["email", "sms", "whatsapp"]);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function outcome(id: string) {
  const [r] = await db()<{ status: string; lastError: string | null; provider: string | null }[]>`
    select status, last_error as "lastError", provider from shop.notification_outbox where id = ${id}`;
  if (!r) return "Queued.";
  if (r.status === "sent") return `Accepted by ${r.provider} for delivery. Delivery status will update when the provider reports it.`;
  if (r.status === "queued") return `Queued — ${r.lastError ? "will retry: " + r.lastError : "it will be sent shortly"}.`;
  return `Not sent (${r.status}): ${r.lastError ?? "unknown reason"}.`;
}

// ------------------------------------------------------------- templates

export async function saveTemplateAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.templates");
    const id = form.get("templateId") ? z.guid().parse(form.get("templateId")) : null;
    const body = str(form, "body");
    if (body.length < 1 || body.length > 4000) throw new UserError("Message text is required (up to 4000 characters).");
    const unknown = unknownVariables(body);
    if (unknown.length) throw new UserError(`Unknown variable(s): ${unknown.map((u) => `{{${u}}}`).join(", ")}.`);
    const dlt = str(form, "dltTemplateId") || null;
    if (dlt && !/^\d{10,25}$/.test(dlt)) throw new UserError("DLT template ID should be the 10–25 digit number from your DLT portal.");
    const wa = str(form, "whatsappTemplateName") || null;
    if (wa && !/^[a-z0-9_]{1,512}$/.test(wa)) throw new UserError("WhatsApp template name uses lowercase letters, numbers and underscores.");
    const approval = z.enum(["draft", "submitted", "approved", "rejected"]).parse(str(form, "approvalStatus") || "draft");
    const fields = {
      subject: str(form, "subject") || null, body, dlt_template_id: dlt, provider_template_id: str(form, "providerTemplateId") || null,
      whatsapp_template_name: wa, whatsapp_language: str(form, "whatsappLanguage") || "en", approval_status: approval,
      is_active: form.get("isActive") === "on",
    };
    const sql = db();
    if (id) {
      const [t] = await sql<{ category: string; channel: string }[]>`select category, channel from shop.message_templates where id = ${id}`;
      if (!t) throw new UserError("Template not found.");
      if (t.category === "promotional" && t.channel === "sms" && !/stop|opt.?out|unsubscribe/i.test(body) && !body.includes("{{unsubscribe_link}}")) {
        throw new UserError("Promotional SMS must tell customers how to opt out (include {{unsubscribe_link}}).");
      }
      await sql`update shop.message_templates set ${sql(fields)} where id = ${id}`;
      await audit(s, { action: "message_template.update", entityType: "message_template", entityId: id, details: { approval } });
    } else {
      const name = str(form, "name");
      const ch = channel.parse(form.get("channel"));
      const category = z.enum(["service", "promotional"]).parse(form.get("category"));
      if (name.length < 2) throw new UserError("Give the template a name.");
      if (category === "promotional" && !body.includes("{{unsubscribe_link}}")) throw new UserError("Promotional templates must include {{unsubscribe_link}} so customers can opt out.");
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "template";
      const [t] = await sql<{ id: string }[]>`
        insert into shop.message_templates ${sql({ ...fields, key: /^[a-z]/.test(key) ? key : `t_${key}`, name, channel: ch, category, created_by: s.staffId })}
        on conflict (key, channel) do nothing returning id`;
      if (!t) throw new UserError("A template with that name already exists for this channel.");
      await audit(s, { action: "message_template.create", entityType: "message_template", entityId: t.id, details: { name, channel: ch, category } });
      revalidatePath("/messages/templates");
      redirect(`/messages/templates/${t.id}`);
    }
    revalidatePath("/messages/templates");
    return { ok: true, message: "Template saved." };
  });
}

// ------------------------------------------------------------- one-to-one

export async function sendToCustomerAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.send");
    const templateId = z.guid().parse(form.get("templateId"));
    const orderNumber = str(form, "orderNumber").toUpperCase();
    const sql = db();
    const [o] = await sql<{ id: string; email: string; phone: string; whatsapp: boolean }[]>`
      select id, email, phone, whatsapp_updates as whatsapp from shop.orders where order_number = ${orderNumber}`;
    if (!o) throw new UserError("No order with that number. One-to-one messages are sent to customers about their orders.");
    const [t] = await sql<{ category: string; key: string; channel: Channel }[]>`select category, key, channel from shop.message_templates where id = ${templateId} and is_active`;
    if (!t) throw new UserError("Choose an active template.");
    const ch = t.channel;
    if (t.category === "promotional") throw new UserError("Promotional messages can only be sent as campaigns to customers who opted in.");
    if (ch === "whatsapp" && !o.whatsapp) throw new UserError("This customer hasn’t opted in to WhatsApp updates.");
    const [recent] = await sql<{ n: number }[]>`
      select count(*)::int as n from shop.notification_outbox where kind = 'service' and payload->>'orderId' = ${o.id} and created_at > now() - interval '1 hour'`;
    if ((recent?.n ?? 0) >= 5) throw new UserError("Too many messages to this customer in the last hour.");
    const [row] = await sql<{ id: string }[]>`
      insert into shop.notification_outbox (channel, recipient, template, template_id, kind, staff_id, payload)
      values (${ch}, ${ch === "email" ? o.email : o.phone}, ${t.key}, ${templateId}, 'service', ${s.staffId}, ${sql.json({ orderId: o.id } as never)})
      returning id::text`;
    await audit(s, { action: "message.send_service", entityType: "order", entityId: o.id, details: { channel: ch, template: t.key } });
    await processOutbox(sql, providerEnv(), { onlyIds: [row!.id] });
    revalidatePath("/messages/history");
    return { ok: true, message: await outcome(row!.id) };
  });
}

export async function testSendAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.send");
    const templateId = z.guid().parse(form.get("templateId"));
    const sql = db();
    const [t] = await sql<{ channel: Channel; key: string }[]>`select channel, key from shop.message_templates where id = ${templateId}`;
    if (!t) throw new UserError("Template not found.");
    const to = normaliseRecipient(t.channel, str(form, "to"));
    if (!to) throw new UserError(t.channel === "email" ? "Enter a valid email address." : "Enter a valid 10-digit mobile number.");
    const [row] = await sql<{ id: string }[]>`
      insert into shop.notification_outbox (channel, recipient, template, template_id, kind, staff_id, payload)
      values (${t.channel}, ${to}, ${t.key}, ${templateId}, 'service', ${s.staffId}, ${sql.json({ name: s.fullName.split(" ")[0], couponCode: str(form, "couponCode") || "SAMPLE10", test: true } as never)})
      returning id::text`;
    await audit(s, { action: "message.test_send", entityType: "message_template", entityId: templateId, details: { channel: t.channel } });
    await processOutbox(sql, providerEnv(), { onlyIds: [row!.id] });
    return { ok: true, message: "Test: " + (await outcome(row!.id)) };
  });
}

// ------------------------------------------------------------- campaigns

function parseAudience(form: FormData): Audience {
  const segment = z.enum(["all_consented", "purchased_within_days", "not_purchased_within_days", "min_total_spent", "bought_category"]).parse(form.get("segment"));
  return {
    segment,
    days: z.coerce.number().int().min(1).max(3650).safeParse(form.get("days")).data,
    minSpentPaise: (z.coerce.number().min(0).max(10_000_000).safeParse(form.get("minSpent")).data ?? 0) * 100,
    categorySlug: z.string().regex(/^[a-z0-9-]{1,80}$/).safeParse(form.get("categorySlug")).data,
  };
}

async function estimate(ch: Channel, audience: Audience) {
  const sql = db();
  const recipients = await audienceRecipients(sql, ch, audience);
  const settings = await getMessagingSettings(sql);
  return { count: recipients.length, cost: recipients.length * costPerMessage(settings, ch, "promotional"), threshold: settings.approvalThreshold };
}

export async function createCampaignAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.campaigns");
    const name = str(form, "name");
    if (name.length < 2 || name.length > 120) throw new UserError("Give the campaign a name.");
    const ch = channel.parse(form.get("channel")) as Channel;
    const templateId = z.guid().parse(form.get("templateId"));
    const audience = parseAudience(form);
    const sql = db();
    const [t] = await sql`select 1 from shop.message_templates where id = ${templateId} and channel = ${ch} and category = 'promotional' and is_active`;
    if (!t) throw new UserError("Choose an active promotional template for this channel.");
    const coupon = str(form, "couponCode").toUpperCase() || null;
    if (coupon) {
      const [c] = await sql`select 1 from shop.coupons where code = ${coupon} and is_active and (ends_at is null or ends_at > now())`;
      if (!c) throw new UserError("That coupon doesn’t exist or isn’t active. Only valid codes can be sent.");
    }
    const when = str(form, "scheduledFor");
    const scheduledFor = when ? new Date(when + ":00+05:30") : null;
    if (scheduledFor && (Number.isNaN(scheduledFor.getTime()) || scheduledFor < new Date(Date.now() - 60_000))) throw new UserError("Schedule time must be in the future.");
    const e = await estimate(ch, audience);
    const [c] = await sql<{ id: string }[]>`
      insert into shop.message_campaigns (name, channel, template_id, audience, coupon_code, scheduled_for, eligible_count, estimated_cost_paise, created_by)
      values (${name}, ${ch}, ${templateId}, ${sql.json(audience as never)}, ${coupon}, ${scheduledFor}, ${e.count}, ${e.cost}, ${s.staffId}) returning id`;
    await audit(s, { action: "campaign.create", entityType: "campaign", entityId: c!.id, details: { name, channel: ch, eligible: e.count } });
    redirect(`/messages/campaigns/${c!.id}`);
  });
}

export async function submitCampaignAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.campaigns");
    const id = z.guid().parse(form.get("campaignId"));
    const sql = db();
    const [c] = await sql<{ status: string; channel: Channel; audience: Audience }[]>`select status, channel, audience from shop.message_campaigns where id = ${id}`;
    if (!c || c.status !== "draft") throw new UserError("Only draft campaigns can be submitted.");
    const e = await estimate(c.channel, c.audience);
    if (e.count === 0) throw new UserError("No customers are eligible (they must have opted in to this channel).");
    const status = e.count > e.threshold ? "pending_approval" : "scheduled";
    await sql`update shop.message_campaigns set status = ${status}, eligible_count = ${e.count}, estimated_cost_paise = ${e.cost} where id = ${id}`;
    await audit(s, { action: "campaign.submit", entityType: "campaign", entityId: id, details: { eligible: e.count, status } });
    revalidatePath(`/messages/campaigns/${id}`);
    return { ok: true, message: status === "pending_approval" ? `Large campaign (${e.count} recipients) — waiting for approval by a manager.` : "Scheduled. It will be sent within the next few minutes of its scheduled time, during permitted hours." };
  });
}

export async function approveCampaignAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.approve", { recentAuth: true });
    const id = z.guid().parse(form.get("campaignId"));
    const sql = db();
    const [c] = await sql<{ status: string; createdBy: string | null; channel: Channel; audience: Audience }[]>`
      select status, created_by as "createdBy", channel, audience from shop.message_campaigns where id = ${id}`;
    if (!c || c.status !== "pending_approval") throw new UserError("This campaign isn’t waiting for approval.");
    if (c.createdBy === s.staffId && s.roleKey !== "owner") throw new UserError("Someone other than the creator must approve a large campaign.");
    const e = await estimate(c.channel, c.audience);
    await sql`update shop.message_campaigns set status = 'scheduled', approved_by = ${s.staffId}, approved_at = now(), eligible_count = ${e.count}, estimated_cost_paise = ${e.cost} where id = ${id}`;
    await audit(s, { action: "campaign.approve", entityType: "campaign", entityId: id, details: { eligible: e.count, estimatedCostPaise: e.cost } });
    revalidatePath(`/messages/campaigns/${id}`);
    return { ok: true, message: "Approved and scheduled." };
  });
}

export async function cancelCampaignAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.campaigns");
    const id = z.guid().parse(form.get("campaignId"));
    const sql = db();
    const r = await sql`update shop.message_campaigns set status = 'cancelled' where id = ${id} and status in ('draft','pending_approval','scheduled','sending')`;
    if (!r.count) throw new UserError("This campaign can’t be cancelled.");
    const q = await sql`update shop.notification_outbox set status = 'cancelled', status_updated_at = now() where campaign_id = ${id} and status = 'queued'`;
    await audit(s, { action: "campaign.cancel", entityType: "campaign", entityId: id, details: { unsent: q.count } });
    revalidatePath(`/messages/campaigns/${id}`);
    return { ok: true, message: `Campaign cancelled. ${q.count} unsent message(s) stopped.` };
  });
}

// ------------------------------------------------------------- consent & settings

export async function withdrawConsentAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.consent");
    const ch = channel.parse(form.get("channel")) as Channel;
    const recipient = normaliseRecipient(ch, str(form, "recipient"));
    if (!recipient) throw new UserError("Invalid recipient.");
    const done = await withdrawConsent(db(), ch, recipient, "staff_on_request", { note: str(form, "note").slice(0, 200) }, s.staffId);
    await audit(s, { action: "consent.withdraw", entityType: "consent", entityId: `${ch}:${recipient.slice(-4)}`, details: { channel: ch } });
    revalidatePath("/messages/consent");
    return { ok: true, message: done ? "Consent withdrawn. Queued promotions to this customer were stopped." : "This customer was already not subscribed." };
  });
}

export async function updateMessagingSettingsAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("messages.settings", { recentAuth: true });
    const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    const int = (k: string, max: number) => z.coerce.number().int().min(0).max(max).parse(form.get(k));
    const v = {
      promo_window_start: time.parse(form.get("promoWindowStart")), promo_window_end: time.parse(form.get("promoWindowEnd")),
      promo_max_per_day: int("promoMaxPerDay", 10), promo_max_per_week: int("promoMaxPerWeek", 30), approval_threshold: int("approvalThreshold", 1_000_000),
      cost_sms_paise: int("costSmsPaise", 10_000), cost_whatsapp_marketing_paise: int("costWhatsappMarketingPaise", 10_000),
      cost_whatsapp_utility_paise: int("costWhatsappUtilityPaise", 10_000), cost_email_paise: int("costEmailPaise", 10_000), updated_by: s.staffId,
    };
    if (v.promo_window_start >= v.promo_window_end) throw new UserError("The sending window must start before it ends.");
    if (v.promo_window_start < "09:00" || v.promo_window_end > "21:00") throw new UserError("Promotional messages in India may only be sent between 09:00 and 21:00.");
    const sql = db();
    await sql`update shop.messaging_settings set ${sql(v)}, updated_at = now() where id`;
    await audit(s, { action: "messaging.settings_update", details: v });
    revalidatePath("/messages/settings");
    return { ok: true, message: "Settings saved." };
  });
}

/** Single entry point for campaign buttons so the confirmation stays on screen after the status changes. */
export async function campaignAction(p: ActionResult, form: FormData): Promise<ActionResult> {
  const op = String(form.get("op") ?? "");
  if (op === "submit") return submitCampaignAction(p, form);
  if (op === "approve") return approveCampaignAction(p, form);
  if (op === "cancel") return cancelCampaignAction(p, form);
  return { error: "Unknown action." };
}

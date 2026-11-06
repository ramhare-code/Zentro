// Customer messaging engine (server-side only).
//
// One outbox for transactional (order updates), service (one-to-one) and
// promotional (campaign) messages. A worker claims due rows, re-checks
// consent/quiet hours/frequency caps for promotions, renders the approved
// template and hands it to the provider. Nothing is ever marked "sent"
// unless the provider accepted it; delivery is only marked when the
// provider reports it via webhook.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql, TransactionSql } from "./db";
import { formatPaise } from "./money";

export type Channel = "email" | "sms" | "whatsapp";
export type MessageKind = "transactional" | "service" | "promotional";

export const TEMPLATE_VARIABLES = [
  "name", "store", "order_number", "total", "order_link", "carrier", "tracking_number", "tracking_link",
  "refund_amount", "coupon_code", "shop_link", "unsubscribe_link",
  "action_link", "code", "ticket_number", "message", "status",
] as const;
export type TemplateVar = (typeof TEMPLATE_VARIABLES)[number];

/** Variables in order of first appearance (WhatsApp/MSG91 parameters are positional). */
export function templateVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]!))];
}

export function unknownVariables(body: string): string[] {
  return templateVariables(body).filter((v) => !(TEMPLATE_VARIABLES as readonly string[]).includes(v));
}

export function renderTemplate(body: string, vars: Partial<Record<TemplateVar, string>>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k as TemplateVar] ?? "");
}

// ------------------------------------------------------------ unsubscribe

export function normaliseRecipient(channel: Channel, raw: string): string | null {
  if (channel === "email") {
    const e = raw.trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
  }
  const p = raw.replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(p) ? p : null;
}

export function unsubscribeSignature(secret: string, channel: Channel, recipient: string): string {
  return createHmac("sha256", secret).update(`unsub|${channel}|${recipient}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(secret: string, channel: Channel, recipient: string, sig: string): boolean {
  const a = Buffer.from(unsubscribeSignature(secret, channel, recipient)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeLink(storefrontUrl: string, secret: string, channel: Channel, recipient: string) {
  const u = new URL("/unsubscribe", storefrontUrl);
  u.searchParams.set("c", channel);
  u.searchParams.set("r", recipient);
  u.searchParams.set("s", unsubscribeSignature(secret, channel, recipient));
  return u.toString();
}

// ------------------------------------------------------------ consent

export async function hasMarketingConsent(sql: Sql | TransactionSql, channel: Channel, recipient: string): Promise<boolean> {
  const [c] = await sql<{ status: string }[]>`
    select status from shop.marketing_consents where channel = ${channel} and recipient = ${recipient} order by id desc limit 1`;
  return c?.status === "granted";
}

export async function withdrawConsent(sql: Sql | TransactionSql, channel: Channel, recipient: string, source: string, evidence: Record<string, unknown> = {}, staffId: string | null = null) {
  if (!(await hasMarketingConsent(sql, channel, recipient))) return false;
  await sql`insert into shop.marketing_consents (channel, recipient, status, source, evidence, staff_id)
            values (${channel}, ${recipient}, 'withdrawn', ${source}, ${sql.json(evidence as never)}, ${staffId})`;
  // stop anything promotional already queued for them, immediately
  await sql`update shop.notification_outbox set status = 'suppressed', last_error = 'Recipient withdrew consent', status_updated_at = now()
            where channel = ${channel} and recipient = ${recipient} and kind = 'promotional' and status = 'queued'`;
  return true;
}

// ------------------------------------------------------------ settings & time

export interface MessagingSettings {
  promoWindowStart: string; promoWindowEnd: string; promoMaxPerDay: number; promoMaxPerWeek: number; approvalThreshold: number;
  costSmsPaise: number; costWhatsappMarketingPaise: number; costWhatsappUtilityPaise: number; costEmailPaise: number;
}

export async function getMessagingSettings(sql: Sql | TransactionSql): Promise<MessagingSettings> {
  const [s] = await sql<MessagingSettings[]>`
    select to_char(promo_window_start, 'HH24:MI') as "promoWindowStart", to_char(promo_window_end, 'HH24:MI') as "promoWindowEnd",
           promo_max_per_day as "promoMaxPerDay", promo_max_per_week as "promoMaxPerWeek", approval_threshold as "approvalThreshold",
           cost_sms_paise as "costSmsPaise", cost_whatsapp_marketing_paise as "costWhatsappMarketingPaise",
           cost_whatsapp_utility_paise as "costWhatsappUtilityPaise", cost_email_paise as "costEmailPaise"
    from shop.messaging_settings where id`;
  return s!;
}

export function costPerMessage(s: MessagingSettings, channel: Channel, kind: MessageKind): number {
  if (channel === "sms") return s.costSmsPaise;
  if (channel === "email") return s.costEmailPaise;
  return kind === "promotional" ? s.costWhatsappMarketingPaise : s.costWhatsappUtilityPaise;
}

/** Minutes since midnight in IST. */
function istMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function inPromoWindow(s: Pick<MessagingSettings, "promoWindowStart" | "promoWindowEnd">, now = new Date()): boolean {
  const m = istMinutes(now);
  return m >= toMin(s.promoWindowStart) && m < toMin(s.promoWindowEnd);
}

/** Next moment the promotional window opens (IST). */
export function nextWindowOpen(s: Pick<MessagingSettings, "promoWindowStart">, now = new Date()): Date {
  const m = istMinutes(now);
  const start = toMin(s.promoWindowStart);
  const minsUntil = m < start ? start - m : 24 * 60 - m + start;
  const d = new Date(now.getTime() + minsUntil * 60_000);
  d.setSeconds(0, 0);
  return d;
}

// ------------------------------------------------------------ audiences

export interface Audience {
  segment: "all_consented" | "purchased_within_days" | "not_purchased_within_days" | "min_total_spent" | "bought_category";
  days?: number;
  minSpentPaise?: number;
  categorySlug?: string;
}

/** Recipients with CURRENT consent for the channel who match the segment. */
export async function audienceRecipients(sql: Sql | TransactionSql, channel: Channel, a: Audience, limit = 100_000): Promise<string[]> {
  const days = Math.max(1, Math.min(3650, a.days ?? 90));
  const contact = channel === "email" ? sql`lower(o.email)` : sql`o.phone`;
  const paid = sql`o.payment_status in ('paid','partially_refunded','refunded','refund_pending')`;
  const seg =
    a.segment === "purchased_within_days" ? sql`and exists (select 1 from shop.orders o where ${contact} = c.recipient and ${paid} and o.placed_at > now() - make_interval(days => ${days}))`
    : a.segment === "not_purchased_within_days" ? sql`and not exists (select 1 from shop.orders o where ${contact} = c.recipient and ${paid} and o.placed_at > now() - make_interval(days => ${days}))`
    : a.segment === "min_total_spent" ? sql`and (select coalesce(sum(o.total_paise), 0) from shop.orders o where ${contact} = c.recipient and o.payment_status = 'paid') >= ${a.minSpentPaise ?? 0}`
    : a.segment === "bought_category" ? sql`and exists (
          select 1 from shop.orders o join shop.order_items i on i.order_id = o.id join shop.products p on p.id = i.product_id
          where ${contact} = c.recipient and ${paid} and p.category_id in (
            with recursive t as (select id from shop.categories where slug = ${a.categorySlug ?? ""} union all select k.id from shop.categories k join t on k.parent_id = t.id)
            select id from t))`
    : sql``;
  const rows = await sql<{ recipient: string }[]>`
    select c.recipient from shop.current_marketing_consent c
    where c.channel = ${channel} and c.status = 'granted' ${seg}
    order by c.recipient limit ${limit}`;
  return rows.map((r) => r.recipient);
}

// ------------------------------------------------------------ providers

export interface ProviderEnv {
  STOREFRONT_URL?: string; NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_BUSINESS_NAME?: string; UNSUBSCRIBE_SECRET?: string;
  RESEND_API_KEY?: string; EMAIL_FROM?: string; RESEND_API_BASE?: string;
  MSG91_AUTH_KEY?: string; MSG91_API_BASE?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string; WHATSAPP_ACCESS_TOKEN?: string; WHATSAPP_API_BASE?: string;
}

export function providerStatus(env: ProviderEnv): Record<Channel, { configured: boolean; provider: string; missing: string[] }> {
  const miss = (keys: (keyof ProviderEnv)[]) => keys.filter((k) => !env[k]);
  const email = miss(["RESEND_API_KEY", "EMAIL_FROM"]);
  const sms = miss(["MSG91_AUTH_KEY"]);
  const wa = miss(["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"]);
  return {
    email: { configured: !email.length, provider: "Resend", missing: email },
    sms: { configured: !sms.length, provider: "MSG91 (DLT)", missing: sms },
    whatsapp: { configured: !wa.length, provider: "WhatsApp Cloud API", missing: wa },
  };
}

export class SkipError extends Error {}     // configuration problem: don't retry, mark skipped
export class PermanentError extends Error {} // provider rejected: don't retry, mark failed

interface Template {
  id: string; key: string; channel: Channel; category: MessageKind; subject: string | null; body: string;
  dltTemplateId: string | null; providerTemplateId: string | null; whatsappTemplateName: string | null; whatsappLanguage: string; approvalStatus: string;
}

async function http(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentError(`${res.status}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function sendViaProvider(env: ProviderEnv, t: Template, to: string, vars: Partial<Record<TemplateVar, string>>, unsubscribeUrl?: string): Promise<{ provider: string; id: string }> {
  const body = renderTemplate(t.body, vars);
  if (t.channel === "email") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new SkipError("Email provider not configured (RESEND_API_KEY, EMAIL_FROM)");
    const r = await http(`${env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM, to: [to], subject: renderTemplate(t.subject ?? t.key, vars), text: body,
        headers: unsubscribeUrl ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
      }),
    });
    return { provider: "resend", id: String(r.id) };
  }
  if (t.channel === "sms") {
    if (!env.MSG91_AUTH_KEY) throw new SkipError("SMS provider not configured (MSG91_AUTH_KEY)");
    if (!t.dltTemplateId || !t.providerTemplateId || t.approvalStatus !== "approved") {
      throw new SkipError("SMS template is not DLT-approved yet (needs DLT template ID, MSG91 template ID and approved status)");
    }
    const params: Record<string, string> = {};
    templateVariables(t.body).forEach((v, i) => (params[`var${i + 1}`] = vars[v as TemplateVar] ?? ""));
    const r = await http(`${env.MSG91_API_BASE ?? "https://control.msg91.com"}/api/v5/flow`, {
      method: "POST",
      headers: { authkey: env.MSG91_AUTH_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ template_id: t.providerTemplateId, short_url: "0", recipients: [{ mobiles: `91${to}`, ...params }] }),
    });
    if (r.type !== "success") throw new PermanentError(`MSG91: ${String(r.message ?? "rejected")}`);
    return { provider: "msg91", id: String(r.message ?? r.request_id) };
  }
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) throw new SkipError("WhatsApp provider not configured (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN)");
  if (!t.whatsappTemplateName || t.approvalStatus !== "approved") throw new SkipError("WhatsApp template is not approved by Meta yet");
  const r = await http(`${env.WHATSAPP_API_BASE ?? "https://graph.facebook.com"}/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: `91${to}`, type: "template",
      template: {
        name: t.whatsappTemplateName, language: { code: t.whatsappLanguage },
        components: [{ type: "body", parameters: templateVariables(t.body).map((v) => ({ type: "text", text: vars[v as TemplateVar] || "-" })) }],
      },
    }),
  });
  const id = (r.messages as { id: string }[] | undefined)?.[0]?.id;
  if (!id) throw new PermanentError("WhatsApp: no message id returned");
  return { provider: "whatsapp", id };
}

// ------------------------------------------------------------ worker

interface OutboxRow {
  id: string; channel: Channel; recipient: string; template: string; templateId: string | null; kind: MessageKind;
  payload: Record<string, unknown>; attempts: number; campaignId: string | null;
}

async function variablesFor(sql: Sql, row: OutboxRow, env: ProviderEnv): Promise<Partial<Record<TemplateVar, string>>> {
  const store = env.NEXT_PUBLIC_BUSINESS_NAME || "Zentro";
  const site = (env.STOREFRONT_URL || env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const vars: Partial<Record<TemplateVar, string>> = { store, shop_link: site, order_link: `${site}/account/orders` };
  const orderId = typeof row.payload.orderId === "string" ? row.payload.orderId : null;
  if (orderId) {
    const [o] = await sql<{ orderNumber: string; name: string; total: number; carrier: string | null; tracking: string | null; trackingUrl: string | null; refund: number | null }[]>`
      select o.order_number as "orderNumber", o.shipping_address->>'fullName' as name, o.total_paise as total,
             s.carrier, s.tracking_number as tracking, s.tracking_url as "trackingUrl",
             (select amount_paise from shop.refunds r where r.order_id = o.id and r.status = 'processed' order by processed_at desc limit 1) as refund
      from shop.orders o left join lateral (select * from shop.shipments x where x.order_id = o.id order by created_at desc limit 1) s on true
      where o.id = ${orderId}`;
    if (o) {
      Object.assign(vars, {
        name: o.name.split(" ")[0], order_number: o.orderNumber, total: formatPaise(o.total),
        carrier: o.carrier ?? "", tracking_number: o.tracking ?? "", tracking_link: o.trackingUrl ?? vars.order_link,
        refund_amount: o.refund ? formatPaise(o.refund) : "",
      });
    }
  }
  if (typeof row.payload.name === "string") vars.name = row.payload.name;
  if (typeof row.payload.couponCode === "string") vars.coupon_code = row.payload.couponCode;
  for (const [k, v] of [["actionLink", "action_link"], ["code", "code"], ["ticketNumber", "ticket_number"], ["message", "message"], ["status", "status"]] as const) {
    if (typeof row.payload[k] === "string") vars[v] = row.payload[k] as string;
  }
  if (row.kind === "promotional" && env.UNSUBSCRIBE_SECRET) vars.unsubscribe_link = unsubscribeLink(site, env.UNSUBSCRIBE_SECRET, row.channel, row.recipient);
  if (!vars.name) vars.name = "there";
  return vars;
}

export interface WorkerResult { claimed: number; sent: number; skipped: number; suppressed: number; failed: number; deferred: number; retried: number }

export async function processOutbox(sql: Sql, env: ProviderEnv, opts: { limit?: number; onlyIds?: string[] } = {}): Promise<WorkerResult> {
  const res: WorkerResult = { claimed: 0, sent: 0, skipped: 0, suppressed: 0, failed: 0, deferred: 0, retried: 0 };
  const settings = await getMessagingSettings(sql);
  const rows = await sql<OutboxRow[]>`
    update shop.notification_outbox set status = 'sending', attempts = attempts + 1, status_updated_at = now()
    where id in (
      select id from shop.notification_outbox
      where status = 'queued' and next_attempt_at <= now() and send_after <= now()
        ${opts.onlyIds ? sql`and id = any(${opts.onlyIds}::bigint[])` : sql``}
      order by (kind = 'promotional'), id
      limit ${opts.limit ?? 50}
      for update skip locked)
    returning id::text, channel, recipient, template, template_id as "templateId", kind, payload, attempts, campaign_id as "campaignId"`;
  res.claimed = rows.length;

  for (const row of rows) {
    const finish = async (status: string, extra: { error?: string; provider?: string; providerId?: string; body?: string; cost?: number; retryAt?: Date } = {}) => {
      await sql`
        update shop.notification_outbox set
          status = ${status}, last_error = ${extra.error?.slice(0, 500) ?? null}, provider = coalesce(${extra.provider ?? null}, provider),
          provider_message_id = coalesce(${extra.providerId ?? null}, provider_message_id), rendered_body = coalesce(${extra.body ?? null}, rendered_body),
          estimated_cost_paise = coalesce(${extra.cost ?? null}, estimated_cost_paise),
          sent_at = case when ${status} = 'sent' then now() else sent_at end,
          next_attempt_at = coalesce(${extra.retryAt ?? null}, next_attempt_at),
          attempts = case when ${status} = 'queued' and ${!!extra.retryAt && extra.error === undefined} then attempts - 1 else attempts end,
          status_updated_at = now()
        where id = ${row.id}`;
    };
    try {
      const [t] = await sql<Template[]>`
        select id, key, channel, category, subject, body, dlt_template_id as "dltTemplateId", provider_template_id as "providerTemplateId",
               whatsapp_template_name as "whatsappTemplateName", whatsapp_language as "whatsappLanguage", approval_status as "approvalStatus"
        from shop.message_templates
        where is_active and channel = ${row.channel} and ${row.templateId ? sql`id = ${row.templateId}` : sql`key = ${row.template}`}
        limit 1`;
      if (!t) { await finish("skipped", { error: `No active ${row.channel} template "${row.template}"` }); res.skipped++; continue; }

      if (row.kind === "promotional") {
        if (!(await hasMarketingConsent(sql, row.channel, row.recipient))) { await finish("suppressed", { error: "No current marketing consent" }); res.suppressed++; continue; }
        if (!env.UNSUBSCRIBE_SECRET) { await finish("skipped", { error: "UNSUBSCRIBE_SECRET not set: promotional messages need an unsubscribe link" }); res.skipped++; continue; }
        if (!inPromoWindow(settings)) { await finish("queued", { retryAt: nextWindowOpen(settings) }); res.deferred++; continue; }
        const [cap] = await sql<{ day: number; week: number }[]>`
          select count(*) filter (where sent_at > now() - interval '1 day')::int as day, count(*)::int as week
          from shop.notification_outbox
          where channel = ${row.channel} and recipient = ${row.recipient} and kind = 'promotional'
            and status in ('sent','delivered','read') and sent_at > now() - interval '7 days'`;
        if (cap!.day >= settings.promoMaxPerDay || cap!.week >= settings.promoMaxPerWeek) { await finish("suppressed", { error: "Frequency limit reached for this customer" }); res.suppressed++; continue; }
      }

      const vars = await variablesFor(sql, row, env);
      const body = renderTemplate(t.body, vars);
      const sent = await sendViaProvider(env, t, row.recipient, vars, vars.unsubscribe_link);
      await finish("sent", { provider: sent.provider, providerId: sent.id, body, cost: costPerMessage(settings, row.channel, row.kind) });
      res.sent++;
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof SkipError) { await finish("skipped", { error: msg }); res.skipped++; }
      else if (e instanceof PermanentError || row.attempts >= 5) { await finish("failed", { error: msg }); res.failed++; }
      else { await finish("queued", { error: msg, retryAt: new Date(Date.now() + 2 ** row.attempts * 60_000) }); res.retried++; }
    }
  }

  // campaigns whose messages are all settled are complete
  await sql`
    update shop.message_campaigns c set status = 'completed', completed_at = now()
    where c.status = 'sending' and not exists (select 1 from shop.notification_outbox o where o.campaign_id = c.id and o.status in ('queued','sending'))`;
  return res;
}

/** Expands scheduled campaigns that are due into outbox rows (consent re-checked again at send time). */
export async function startDueCampaigns(sql: Sql): Promise<number> {
  const due = await sql<{ id: string; channel: Channel; templateId: string; audience: Audience; couponCode: string | null }[]>`
    update shop.message_campaigns set status = 'sending', started_at = now()
    where id in (select id from shop.message_campaigns where status = 'scheduled' and coalesce(scheduled_for, now()) <= now() for update skip locked)
    returning id, channel, template_id as "templateId", audience, coupon_code as "couponCode"`;
  for (const c of due) {
    const recipients = await audienceRecipients(sql, c.channel, c.audience);
    for (let i = 0; i < recipients.length; i += 500) {
      const chunk = recipients.slice(i, i + 500);
      await sql`
        insert into shop.notification_outbox (channel, recipient, template, template_id, kind, campaign_id, payload, dedupe_key)
        select ${c.channel}, r, 'campaign', ${c.templateId}, 'promotional', ${c.id}, ${sql.json({ couponCode: c.couponCode } as never)}, ${"campaign:" + c.id + ":"} || r
        from unnest(${chunk}::text[]) as r
        on conflict (dedupe_key) do nothing`;
    }
  }
  return due.length;
}

/** Maps provider delivery statuses onto the outbox. Only moves forward (sent → delivered → read). */
export async function applyDeliveryStatus(sql: Sql, provider: string, providerMessageId: string, status: "sent" | "delivered" | "read" | "failed", detail: Record<string, unknown> = {}, actualCostPaise?: number) {
  const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
  const [row] = await sql<{ id: string; status: string }[]>`select id::text, status from shop.notification_outbox where provider = ${provider} and provider_message_id = ${providerMessageId}`;
  await sql`insert into shop.message_status_events (outbox_id, provider, provider_message_id, status, detail) values (${row?.id ?? null}, ${provider}, ${providerMessageId}, ${status}, ${sql.json(detail as never)})`;
  if (!row) return false;
  if ((rank[status] ?? 0) <= (rank[row.status] ?? 0) && status !== "failed") return true;
  await sql`update shop.notification_outbox set status = ${status}, status_updated_at = now(),
            delivered_at = case when ${status} in ('delivered','read') then coalesce(delivered_at, now()) else delivered_at end,
            last_error = case when ${status} = 'failed' then ${String(detail.error ?? "Delivery failed").slice(0, 300)} else last_error end,
            actual_cost_paise = coalesce(${actualCostPaise ?? null}, actual_cost_paise)
            where id = ${row.id}`;
  return true;
}

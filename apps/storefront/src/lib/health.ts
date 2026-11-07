import "server-only";
import { razorpayConfigFromEnv } from "@zentro/commerce/razorpay";
import { shiprocketConfigFromEnv } from "@zentro/commerce/shipping";
import { db } from "./db";
import { getSettings } from "./settings";

/** What an operator needs to know is configured and running — never secret values. */
export async function integrationChecks(): Promise<Record<string, string>> {
  const sql = db();
  const [r] = await sql<{ cron: Date | null; cronOk: boolean | null; backlog: number; webhookErrors: number }[]>`
    select (select max(started_at) from shop.job_runs where job = 'maintenance') as cron,
           (select ok from shop.job_runs where job = 'maintenance' order by started_at desc limit 1) as "cronOk",
           (select count(*)::int from shop.notification_outbox where status = 'queued' and created_at < now() - interval '30 minutes') as backlog,
           (select count(*)::int from shop.payment_webhook_events where error is not null and processed_at is null) as "webhookErrors"`;
  const s = await getSettings();
  const cronAge = r?.cron ? Math.round((Date.now() - r.cron.getTime()) / 60000) : null;
  return {
    payments: razorpayConfigFromEnv() ? (razorpayConfigFromEnv()!.webhookSecret ? "configured" : "missing webhook secret") : "not configured",
    courier: shiprocketConfigFromEnv() ? "configured" : "not configured",
    email: process.env.RESEND_API_KEY ? "configured" : "not configured",
    sms: process.env.MSG91_AUTH_KEY ? "configured" : "not configured",
    whatsapp: process.env.WHATSAPP_ACCESS_TOKEN ? "configured" : "not configured",
    storage: process.env.MEDIA_STORAGE === "supabase" ? "supabase" : "database",
    cron: cronAge === null ? "never ran" : cronAge > 15 ? `stale (${cronAge} min ago)` : r?.cronOk === false ? "last run failed" : `ok (${cronAge} min ago)`,
    messageBacklog: String(r?.backlog ?? 0),
    webhookErrors: String(r?.webhookErrors ?? 0),
    gstDetails: s.gstin && s.stateCode && s.legalName ? "complete" : "incomplete",
    secrets: ["CRON_SECRET", "UNSUBSCRIBE_SECRET", "TICKET_LINK_SECRET", "REVALIDATE_SECRET"].filter((k) => !process.env[k]).map((k) => `${k} missing`).join(", ") || "ok",
  };
}

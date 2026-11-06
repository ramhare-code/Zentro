import "server-only";
import { db } from "./db";

export interface CampaignRow {
  id: string; name: string; channel: "email" | "sms" | "whatsapp"; status: string; templateId: string; templateName: string; templateBody: string;
  audience: { segment: string; days?: number; minSpentPaise?: number; categorySlug?: string }; couponCode: string | null;
  scheduledFor: Date | null; eligibleCount: number | null; estimatedCostPaise: number | null; createdBy: string | null; createdByEmail: string | null;
  approvedByEmail: string | null; approvedAt: Date | null; startedAt: Date | null; completedAt: Date | null; createdAt: Date;
  queued: number; sent: number; delivered: number; failed: number; suppressed: number; cost: number;
}

export async function listCampaigns(where?: string[]) {
  const sql = db();
  return sql<CampaignRow[]>`
    select c.id, c.name, c.channel, c.status, c.template_id as "templateId", t.name as "templateName", t.body as "templateBody", c.audience,
           c.coupon_code as "couponCode", c.scheduled_for as "scheduledFor", c.eligible_count as "eligibleCount", c.estimated_cost_paise as "estimatedCostPaise",
           c.created_by as "createdBy", cu.email as "createdByEmail", au.email as "approvedByEmail", c.approved_at as "approvedAt",
           c.started_at as "startedAt", c.completed_at as "completedAt", c.created_at as "createdAt",
           coalesce(s.queued, 0)::int as queued, coalesce(s.sent, 0)::int as sent, coalesce(s.delivered, 0)::int as delivered,
           coalesce(s.failed, 0)::int as failed, coalesce(s.suppressed, 0)::int as suppressed, coalesce(s.cost, 0)::int as cost
    from shop.message_campaigns c
    join shop.message_templates t on t.id = c.template_id
    left join shop.staff_users cu on cu.id = c.created_by
    left join shop.staff_users au on au.id = c.approved_by
    left join lateral (
      select count(*) filter (where status in ('queued','sending')) as queued,
             count(*) filter (where status in ('sent','delivered','read')) as sent,
             count(*) filter (where status in ('delivered','read')) as delivered,
             count(*) filter (where status = 'failed') as failed,
             count(*) filter (where status in ('suppressed','skipped')) as suppressed,
             sum(coalesce(actual_cost_paise, estimated_cost_paise)) filter (where status in ('sent','delivered','read')) as cost
      from shop.notification_outbox o where o.campaign_id = c.id) s on true
    ${where ? sql`where c.status = any(${where}::text[])` : sql``}
    order by c.created_at desc limit 200`;
}

export function describeAudience(a: CampaignRow["audience"]) {
  switch (a.segment) {
    case "purchased_within_days": return `Bought in the last ${a.days ?? 90} days`;
    case "not_purchased_within_days": return `No purchase in the last ${a.days ?? 90} days`;
    case "min_total_spent": return `Spent at least ₹${Math.round((a.minSpentPaise ?? 0) / 100).toLocaleString("en-IN")}`;
    case "bought_category": return `Bought from “${a.categorySlug}”`;
    default: return "Everyone who opted in";
  }
}

import "server-only";
import { db } from "./db";

export interface TemplateRow {
  id: string; key: string; name: string; channel: "email" | "sms" | "whatsapp"; category: string; subject: string | null; body: string;
  dltTemplateId: string | null; providerTemplateId: string | null; whatsappTemplateName: string | null; whatsappLanguage: string;
  approvalStatus: string; isSystem: boolean; isActive: boolean; updatedAt: Date;
}

export const templateCols = (sql: ReturnType<typeof db>) => sql`
  id, key, name, channel, category, subject, body, dlt_template_id as "dltTemplateId", provider_template_id as "providerTemplateId",
  whatsapp_template_name as "whatsappTemplateName", whatsapp_language as "whatsappLanguage", approval_status as "approvalStatus",
  is_system as "isSystem", is_active as "isActive", updated_at as "updatedAt"`;

export async function listTemplates(filter?: { category?: string[] }) {
  const sql = db();
  return sql<TemplateRow[]>`
    select ${templateCols(sql)} from shop.message_templates
    ${filter?.category ? sql`where category = any(${filter.category}::text[])` : sql``}
    order by category, key, channel`;
}

/** Whether a template can actually be delivered on its channel today. */
export function readiness(t: Pick<TemplateRow, "channel" | "approvalStatus" | "dltTemplateId" | "providerTemplateId" | "whatsappTemplateName">): string | null {
  if (t.channel === "sms" && (!t.dltTemplateId || !t.providerTemplateId)) return "Needs DLT template ID and MSG91 template ID";
  if (t.channel === "whatsapp" && !t.whatsappTemplateName) return "Needs the Meta-approved template name";
  if (t.channel !== "email" && t.approvalStatus !== "approved") return `Approval status: ${t.approvalStatus}`;
  return null;
}

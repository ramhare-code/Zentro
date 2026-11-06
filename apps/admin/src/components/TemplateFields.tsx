import type { TemplateRow } from "@/lib/messages-data";
import { TEMPLATE_VARIABLES } from "@zentro/commerce/messaging";

export function TemplateFields({ t, channel }: { t?: TemplateRow; channel?: string }) {
  const ch = t?.channel ?? channel;
  return (
    <div className="space-y-4">
      {(ch === "email" || !ch) && <label className="block text-sm font-medium">Email subject<input name="subject" defaultValue={t?.subject ?? ""} maxLength={150} className="input mt-1.5 h-10" /></label>}
      <label className="block text-sm font-medium">Message
        <textarea name="body" required rows={6} maxLength={4000} defaultValue={t?.body} className="input mt-1.5 h-auto py-2 font-mono text-sm" />
        <span className="mt-1 block text-xs font-normal text-ink-muted">Variables: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}. For SMS and WhatsApp the text must match the approved template exactly.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {(ch === "sms" || !ch) && <>
          <label className="text-sm font-medium">DLT template ID (SMS)<input name="dltTemplateId" defaultValue={t?.dltTemplateId ?? ""} inputMode="numeric" className="input mt-1.5 h-10" /></label>
          <label className="text-sm font-medium">MSG91 template ID (SMS)<input name="providerTemplateId" defaultValue={t?.providerTemplateId ?? ""} className="input mt-1.5 h-10" /></label>
        </>}
        {(ch === "whatsapp" || !ch) && <>
          <label className="text-sm font-medium">WhatsApp template name<input name="whatsappTemplateName" defaultValue={t?.whatsappTemplateName ?? ""} className="input mt-1.5 h-10" /></label>
          <label className="text-sm font-medium">WhatsApp language code<input name="whatsappLanguage" defaultValue={t?.whatsappLanguage ?? "en"} className="input mt-1.5 h-10" /></label>
        </>}
        <label className="text-sm font-medium">Provider approval
          <select name="approvalStatus" defaultValue={t?.approvalStatus ?? "draft"} className="input mt-1.5 h-10">
            <option value="draft">Draft (not submitted)</option><option value="submitted">Submitted, awaiting approval</option><option value="approved">Approved by DLT / Meta</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" name="isActive" defaultChecked={t?.isActive ?? true} className="size-4 accent-brand-600" />Active</label>
      </div>
    </div>
  );
}

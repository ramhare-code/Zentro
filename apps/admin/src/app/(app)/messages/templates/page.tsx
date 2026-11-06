import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { TemplateFields } from "@/components/TemplateFields";
import { saveTemplateAction } from "@/lib/actions/messages";
import { listTemplates, readiness } from "@/lib/messages-data";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Message templates" };

export default async function TemplatesPage() {
  const s = await requirePermission("messages.read");
  const templates = await listTemplates();
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/templates" title="Templates" />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Template</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Type</th><th className="px-5 py-3">Ready to send?</th></tr></thead>
          <tbody className="divide-y divide-line">
            {templates.map((t) => {
              const r = readiness(t);
              return (
                <tr key={t.id}>
                  <td className="px-5 py-3"><Link href={`/messages/templates/${t.id}`} className="font-semibold text-brand-700 hover:underline">{t.name}</Link>{!t.isActive && <span className="ml-2 text-xs text-ink-muted">(inactive)</span>}</td>
                  <td className="px-3 py-3">{CHANNEL_LABEL[t.channel]}</td>
                  <td className="px-3 py-3 capitalize">{t.category}</td>
                  <td className="px-5 py-3">{r ? <span className="text-warn-700">{r}</span> : <span className="text-good-700">Yes</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {s.permissions.has("messages.templates") && (
        <section className="card p-5" aria-labelledby="new-h">
          <h2 id="new-h" className="font-semibold">New template</h2>
          <ActionForm action={saveTemplateAction} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-medium">Name<input name="name" required minLength={2} maxLength={100} placeholder="Diwali sale" className="input mt-1.5 h-10" /></label>
              <label className="text-sm font-medium">Channel<select name="channel" className="input mt-1.5 h-10"><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
              <label className="text-sm font-medium">Type<select name="category" className="input mt-1.5 h-10"><option value="promotional">Promotional (offers, new arrivals, coupons)</option><option value="service">Service (one-to-one help)</option></select></label>
            </div>
            <TemplateFields />
            <SubmitButton>Create template</SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}

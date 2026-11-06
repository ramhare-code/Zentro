import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { renderTemplate } from "@zentro/commerce/messaging";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { TemplateFields } from "@/components/TemplateFields";
import { saveTemplateAction } from "@/lib/actions/messages";
import { db } from "@/lib/db";
import { readiness, templateCols, type TemplateRow } from "@/lib/messages-data";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Edit template" };

const SAMPLE = { name: "Priya", store: "Zentro", order_number: "ZN261106100001", total: "₹3,298", order_link: "https://yourstore.in/account/orders", carrier: "Delhivery", tracking_number: "DLV123456789", tracking_link: "https://…", refund_amount: "₹1,299", coupon_code: "FESTIVE15", shop_link: "https://yourstore.in", unsubscribe_link: "https://yourstore.in/unsubscribe?…" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("messages.read");
  const id = z.guid().safeParse((await params).id).data;
  const sql = db();
  const [t] = id ? await sql<TemplateRow[]>`select ${templateCols(sql)} from shop.message_templates where id = ${id}` : [];
  if (!t) notFound();
  const r = readiness(t);
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/templates" title={t.name}><Link href="/messages/templates" className="text-sm font-semibold text-brand-700">← Templates</Link></MessagesNav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-5">
          <p className="text-sm text-ink-muted">{CHANNEL_LABEL[t.channel]} · <span className="capitalize">{t.category}</span>{t.isSystem && " · built-in"}</p>
          {s.permissions.has("messages.templates") ? (
            <ActionForm action={saveTemplateAction} className="mt-4 space-y-4">
              <input type="hidden" name="templateId" value={t.id} />
              <TemplateFields t={t} />
              <SubmitButton>Save template</SubmitButton>
            </ActionForm>
          ) : <pre className="mt-4 whitespace-pre-wrap text-sm">{t.body}</pre>}
        </section>
        <aside className="space-y-4">
          <section className="card p-5">
            <h2 className="font-semibold">Preview</h2>
            {t.subject && <p className="mt-3 text-sm font-semibold">{renderTemplate(t.subject, SAMPLE)}</p>}
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-canvas p-4 text-sm">{renderTemplate(t.body, SAMPLE)}</p>
            <p className="mt-2 text-xs text-ink-muted">Sample values shown. {t.channel === "sms" && `${renderTemplate(t.body, SAMPLE).length} characters (${Math.ceil(renderTemplate(t.body, SAMPLE).length / 153)} SMS part(s)).`}</p>
          </section>
          <section className={`rounded-2xl p-4 text-sm ${r ? "bg-warn-50 text-warn-700" : "bg-good-50 text-good-700"}`}>{r ? `Not deliverable yet — ${r}.` : "Ready: this template can be delivered once the provider is connected."}</section>
        </aside>
      </div>
    </div>
  );
}

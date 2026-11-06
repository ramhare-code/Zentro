import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { sendToCustomerAction, testSendAction } from "@/lib/actions/messages";
import { listTemplates, readiness } from "@/lib/messages-data";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Compose message" };

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requirePermission("messages.send");
  const { order } = await searchParams;
  const service = await listTemplates({ category: ["service", "transactional"] });
  const all = await listTemplates();
  const opt = (t: (typeof all)[number]) => <option key={t.id} value={t.id}>{CHANNEL_LABEL[t.channel]} · {t.name}{readiness(t) ? " (not ready)" : ""}</option>;
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/compose" title="Compose" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="one-h">
          <h2 id="one-h" className="font-semibold">Message a customer about their order</h2>
          <p className="mt-1 text-sm text-ink-muted">Service messages only (order updates, delivery questions). Promotions must go through a campaign so consent is checked.</p>
          <ActionForm action={sendToCustomerAction} className="mt-4 space-y-3">
            <label className="block text-sm font-medium">Order number<input name="orderNumber" required defaultValue={order} placeholder="ZN261106100001" className="input mt-1.5 h-10" /></label>
            <label className="block text-sm font-medium">Template
              <select name="templateId" required className="input mt-1.5 h-10">{service.filter((t) => t.isActive).map(opt)}</select>
            </label>
            <p className="text-xs text-ink-muted">Variables like the customer’s name, order number and tracking details are filled in from the order.</p>
            <SubmitButton>Send now</SubmitButton>
          </ActionForm>
        </section>
        <section className="card p-5" aria-labelledby="test-h">
          <h2 id="test-h" className="font-semibold">Send a test</h2>
          <p className="mt-1 text-sm text-ink-muted">Preview any template on your own phone or inbox before using it.</p>
          <ActionForm action={testSendAction} className="mt-4 space-y-3">
            <label className="block text-sm font-medium">Template<select name="templateId" required className="input mt-1.5 h-10">{all.filter((t) => t.isActive).map(opt)}</select></label>
            <label className="block text-sm font-medium">Send to (your mobile or email)<input name="to" required className="input mt-1.5 h-10" /></label>
            <label className="block text-sm font-medium">Sample coupon code <span className="font-normal text-ink-muted">(optional)</span><input name="couponCode" maxLength={20} className="input mt-1.5 h-10" /></label>
            <SubmitButton variant="secondary">Send test</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}

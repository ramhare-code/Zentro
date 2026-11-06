import { getMessagingSettings, providerStatus } from "@zentro/commerce/messaging";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CHANNEL_LABEL, MessagesNav } from "@/components/MessagesNav";
import { updateMessagingSettingsAction } from "@/lib/actions/messages";
import { db } from "@/lib/db";
import { providerEnv } from "@/lib/messaging-env";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Messaging settings" };

export default async function MessagingSettingsPage() {
  await requirePermission("messages.settings");
  const s = await getMessagingSettings(db());
  const providers = providerStatus(providerEnv());
  const num = (name: string, label: string, value: number, help?: string) => (
    <label className="text-sm font-medium">{label}<input name={name} type="number" min={0} defaultValue={value} className="input mt-1.5 h-10" />{help && <span className="mt-1 block text-xs font-normal text-ink-muted">{help}</span>}</label>
  );
  return (
    <div className="space-y-6">
      <MessagesNav active="/messages/settings" title="Providers & settings" />
      <section className="card p-5" aria-labelledby="prov-h">
        <h2 id="prov-h" className="font-semibold">Providers</h2>
        <p className="mt-1 text-sm text-ink-muted">API keys are read only from environment variables on the server and are never shown here or stored in the database.</p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {(["sms", "whatsapp", "email"] as const).map((ch) => (
            <li key={ch} className="rounded-xl bg-canvas p-4 text-sm">
              <p className="font-semibold">{CHANNEL_LABEL[ch]} — {providers[ch].provider}</p>
              <p className={providers[ch].configured ? "mt-1 text-good-700" : "mt-1 text-warn-700"}>{providers[ch].configured ? "Connected" : `Missing: ${providers[ch].missing.join(", ")}`}</p>
              {ch === "sms" && <p className="mt-2 text-xs text-ink-muted">India: register as a Principal Entity on a DLT portal, get your sender header approved, and register every template (including variables) before sending.</p>}
              {ch === "whatsapp" && <p className="mt-2 text-xs text-ink-muted">Use Meta-approved templates. Marketing templates need explicit WhatsApp opt-in; replies of STOP unsubscribe automatically.</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">{process.env.UNSUBSCRIBE_SECRET ? "Unsubscribe links: configured." : "UNSUBSCRIBE_SECRET is not set — promotional messages will not be sent until it is."}</p>
      </section>
      <ActionForm action={updateMessagingSettingsAction} className="card space-y-5 p-5">
        <h2 className="font-semibold">Rules for promotional messages</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium">Sending window starts (IST)<input name="promoWindowStart" type="time" defaultValue={s.promoWindowStart} className="input mt-1.5 h-10" /></label>
          <label className="text-sm font-medium">Sending window ends (IST)<input name="promoWindowEnd" type="time" defaultValue={s.promoWindowEnd} className="input mt-1.5 h-10" /></label>
          {num("approvalThreshold", "Approval needed above (recipients)", s.approvalThreshold)}
          {num("promoMaxPerDay", "Max promotions per customer per day (per channel)", s.promoMaxPerDay)}
          {num("promoMaxPerWeek", "Max per customer per week", s.promoMaxPerWeek)}
        </div>
        <h2 className="font-semibold">Cost estimates (paise per message)</h2>
        <p className="-mt-3 text-sm text-ink-muted">Used for previews before sending. Enter your contracted rates; providers’ reported charges are shown where available.</p>
        <div className="grid gap-4 md:grid-cols-4">
          {num("costSmsPaise", "SMS", s.costSmsPaise)}
          {num("costWhatsappMarketingPaise", "WhatsApp marketing", s.costWhatsappMarketingPaise)}
          {num("costWhatsappUtilityPaise", "WhatsApp utility", s.costWhatsappUtilityPaise)}
          {num("costEmailPaise", "Email", s.costEmailPaise)}
        </div>
        <SubmitButton>Save settings</SubmitButton>
      </ActionForm>
    </div>
  );
}

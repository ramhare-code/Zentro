import { INDIAN_STATES } from "@zentro/commerce";
import { loadStoreSettings } from "@zentro/commerce/settings";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsNav } from "@/components/SettingsNav";
import { saveStoreDetailsAction } from "@/lib/actions/settings";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await requirePermission("settings.manage");
  const st = await loadStoreSettings(db());
  const missing = [!st.legalName && "legal name", !st.address && "registered address", !st.gstin && "GSTIN", !st.stateCode && "state", !st.supportEmail && "support email", !st.grievanceName && "grievance officer"].filter(Boolean);
  return (
    <div className="space-y-5">
      <SettingsNav active="/settings" title="Settings" s={s} />
      {missing.length > 0 && (
        <p className="card border-l-4 border-warn-500 p-4 text-sm">
          <strong>Before launch, add: {missing.join(", ")}.</strong> Without a legal name, address and GSTIN, customers get a payment receipt instead of a GST tax invoice, and checkout stays closed until your state is set. Indian e-commerce rules also require a grievance officer’s name and contact.
        </p>
      )}
      <ActionForm action={saveStoreDetailsAction} className="card max-w-3xl space-y-5 p-5">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">Business</legend>
          <label className="text-sm font-medium">Store name<input name="businessName" maxLength={60} defaultValue={st.businessName} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Registered legal name<input name="legalName" maxLength={120} defaultValue={st.legalName ?? ""} placeholder="As on your GST certificate" className="input mt-1.5" /></label>
          <label className="text-sm font-medium sm:col-span-2">Registered address<textarea name="address" rows={3} maxLength={400} defaultValue={st.address ?? ""} className="input mt-1.5 h-auto py-2" /></label>
          <label className="text-sm font-medium">GSTIN<input name="gstin" maxLength={15} defaultValue={st.gstin ?? ""} className="input mt-1.5 font-mono uppercase" /></label>
          <label className="text-sm font-medium">State of GST registration<select name="stateCode" defaultValue={st.stateCode ?? ""} className="input mt-1.5"><option value="">Choose…</option>{INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
          <p className="text-xs text-ink-muted sm:col-span-2">Changing the GSTIN or state asks you to confirm it’s you. Invoices already issued keep the details printed on them.</p>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">Customer care</legend>
          <label className="text-sm font-medium">Support email<input name="supportEmail" type="email" defaultValue={st.supportEmail ?? ""} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Support phone<input name="supportPhone" maxLength={20} defaultValue={st.supportPhone ?? ""} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Support hours<input name="supportHours" maxLength={80} defaultValue={st.supportHours ?? ""} placeholder="Mon–Sat, 10am–6pm" className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Return window (days)<input name="returnWindowDays" inputMode="numeric" defaultValue={st.returnWindowDays} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Grievance officer name<input name="grievanceName" maxLength={100} defaultValue={st.grievanceName ?? ""} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Grievance officer email<input name="grievanceEmail" type="email" defaultValue={st.grievanceEmail ?? ""} className="input mt-1.5" /></label>
        </fieldset>
        <SubmitButton>Save details</SubmitButton>
      </ActionForm>
    </div>
  );
}

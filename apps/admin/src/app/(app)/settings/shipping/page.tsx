import { formatPaise, INDIAN_STATES, STATE_CODES } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsNav } from "@/components/SettingsNav";
import { deleteShippingRateAction, pincodesAction, saveShippingRateAction } from "@/lib/actions/settings";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Shipping & delivery" };

interface Rate { id: string; name: string; stateCodes: string[] | null; pincodePrefixes: string[] | null; min: number; max: number | null; fee: number; daysMin: number; daysMax: number; priority: number; isActive: boolean }

function RateFields({ r }: { r?: Rate }) {
  const rs = (p: number | null | undefined) => (p === null || p === undefined ? "" : String(p / 100));
  return (
    <div className="space-y-3">
      {r && <input type="hidden" name="rateId" value={r.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium">Name<input name="name" required maxLength={60} defaultValue={r?.name} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Delivery charge ₹<input name="fee" inputMode="decimal" required defaultValue={r ? rs(r.fee) : ""} placeholder="0 for free" className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Priority <span className="font-normal text-ink-muted">(lower wins)</span><input name="priority" inputMode="numeric" defaultValue={r?.priority ?? 100} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Order value from ₹<input name="minSubtotal" inputMode="decimal" defaultValue={r && r.min ? rs(r.min) : ""} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Order value up to ₹ <span className="font-normal text-ink-muted">(blank = any)</span><input name="maxSubtotal" inputMode="decimal" defaultValue={rs(r?.max)} className="input mt-1.5" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">Days from<input name="daysMin" inputMode="numeric" required defaultValue={r?.daysMin ?? 3} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">to<input name="daysMax" inputMode="numeric" required defaultValue={r?.daysMax ?? 7} className="input mt-1.5" /></label>
        </div>
      </div>
      <label className="block text-sm font-medium">States <span className="font-normal text-ink-muted">(none selected = all of India)</span>
        <select name="stateCodes" multiple defaultValue={r?.stateCodes ?? []} className="input mt-1.5 h-28 py-1">{INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
      <label className="block text-sm font-medium">Pincode prefixes <span className="font-normal text-ink-muted">(optional, e.g. 560 5601)</span><input name="pincodePrefixes" defaultValue={r?.pincodePrefixes?.join(" ") ?? ""} className="input mt-1.5 font-mono text-sm" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={r?.isActive ?? true} className="size-4" /> Active</label>
    </div>
  );
}

export default async function ShippingSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("settings.manage");
  const sp = await searchParams;
  const sql = db();
  const [rates, pins] = await Promise.all([
    sql<Rate[]>`select id, name, state_codes as "stateCodes", pincode_prefixes as "pincodePrefixes", min_subtotal_paise as min, max_subtotal_paise as max,
                       fee_paise as fee, est_days_min as "daysMin", est_days_max as "daysMax", priority, is_active as "isActive"
                from shop.shipping_rates order by is_active desc, priority, name`,
    sql<{ pincode: string; reason: string | null }[]>`select pincode, reason from shop.unserviceable_pincodes order by pincode limit 500`,
  ]);
  // coverage check: which rate would a customer get?
  const test = sp.state && STATE_CODES.includes(sp.state) && /^[1-9]\d{5}$/.test(sp.pin ?? "") ? { state: sp.state, pin: sp.pin!, sub: Math.round((Number(sp.sub) || 0) * 100) } : null;
  let result: string | null = null;
  if (test) {
    const [blocked] = await sql`select 1 from shop.unserviceable_pincodes where pincode = ${test.pin}`;
    const [hit] = blocked ? [] : await sql<{ name: string; fee: number; min: number; max: number }[]>`
      select name, fee_paise as fee, est_days_min as min, est_days_max as max from shop.shipping_rates
      where is_active and (state_codes is null or ${test.state} = any(state_codes))
        and (pincode_prefixes is null or exists (select 1 from unnest(pincode_prefixes) p where ${test.pin} like p || '%'))
        and min_subtotal_paise <= ${test.sub} and (max_subtotal_paise is null or max_subtotal_paise >= ${test.sub})
      order by priority limit 1`;
    result = blocked ? "Blocked: this pincode is on your no-delivery list." : hit ? `“${hit.name}”: ${hit.fee ? formatPaise(hit.fee) : "Free"}, ${hit.min}–${hit.max} days.` : "No rate matches — this customer can’t check out. Add a rate that covers them.";
  }
  const catchAll = rates.some((r) => r.isActive && !r.stateCodes && !r.pincodePrefixes && r.min === 0 && r.max === null);
  return (
    <div className="space-y-5">
      <SettingsNav active="/settings/shipping" title="Shipping & delivery" s={s} />
      {!catchAll && <p className="card border-l-4 border-warn-500 p-4 text-sm"><strong>No active rate covers every address and order value.</strong> Customers outside your rates can’t check out. Use the check below, or add a rate with no states, no pincodes and no order limits as a fallback.</p>}
      <form aria-label="Coverage check" className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm font-medium">State<select name="state" defaultValue={test?.state ?? ""} className="input mt-1.5 h-10 w-52"><option value="">Choose…</option>{INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
        <label className="text-sm font-medium">Pincode<input name="pin" defaultValue={test?.pin} inputMode="numeric" maxLength={6} className="input mt-1.5 h-10 w-28" /></label>
        <label className="text-sm font-medium">Order value ₹<input name="sub" defaultValue={sp.sub} inputMode="decimal" className="input mt-1.5 h-10 w-28" /></label>
        <button className="btn btn-secondary h-10">Check delivery</button>
        {result && <p role="status" className="w-full text-sm font-semibold">{result}</p>}
      </form>
      <div className="grid gap-5 lg:grid-cols-[1fr_26rem] lg:items-start">
        <section aria-label="Shipping rates" className="space-y-2">
          <p className="text-sm text-ink-muted">At checkout, the active rate with the lowest priority number that matches the address and order value is used.</p>
          {rates.map((r) => (
            <details key={r.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span><span className="font-semibold">{r.name}</span>{!r.isActive && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">Off</span>}
                  <span className="block text-xs text-ink-muted">{r.stateCodes ? r.stateCodes.join(", ") : "All states"}{r.pincodePrefixes && ` · pincodes ${r.pincodePrefixes.join(", ")}…`} · orders {formatPaise(r.min)}{r.max !== null ? `–${formatPaise(r.max)}` : "+"} · priority {r.priority}</span></span>
                <span className="font-semibold">{r.fee ? formatPaise(r.fee) : "Free"} · {r.daysMin}–{r.daysMax} days</span>
              </summary>
              <div className="border-t border-line p-4">
                <ActionForm action={saveShippingRateAction}><RateFields r={r} /><div className="mt-3"><SubmitButton>Save rate</SubmitButton></div></ActionForm>
                <ActionForm action={deleteShippingRateAction} className="mt-2"><input type="hidden" name="rateId" value={r.id} /><SubmitButton variant="secondary" confirm={`Delete “${r.name}”?`}>Delete</SubmitButton></ActionForm>
              </div>
            </details>
          ))}
        </section>
        <div className="space-y-5">
          <section aria-labelledby="new-rate" className="card p-5"><h2 id="new-rate" className="font-semibold">Add a rate</h2><ActionForm action={saveShippingRateAction} className="mt-3"><RateFields /><div className="mt-3"><SubmitButton>Add rate</SubmitButton></div></ActionForm></section>
          <section aria-labelledby="pins" className="card p-5">
            <h2 id="pins" className="font-semibold">Pincodes you don’t deliver to ({pins.length}{pins.length === 500 && "+"})</h2>
            <ActionForm action={pincodesAction} className="mt-3 space-y-3">
              <label className="block text-sm font-medium">Pincodes<textarea name="pincodes" rows={3} placeholder="Paste pincodes separated by spaces, commas or new lines" className="input mt-1.5 h-auto py-2 font-mono text-sm" /></label>
              <label className="block text-sm font-medium">Reason (optional)<input name="reason" maxLength={100} className="input mt-1.5" /></label>
              <div className="flex gap-2"><SubmitButton name="op" value="add">Block</SubmitButton><SubmitButton name="op" value="remove" variant="secondary">Unblock</SubmitButton></div>
            </ActionForm>
            {pins.length > 0 && <p className="mt-3 max-h-32 overflow-y-auto font-mono text-xs text-ink-muted">{pins.map((p) => p.pincode).join(" ")}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

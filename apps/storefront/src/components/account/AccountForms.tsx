"use client";

import { INDIAN_STATES } from "@zentro/commerce";
import { ActionForm, fieldClass, Submit } from "../ui/ActionForm";
import {
  deleteAccountAction, deleteAddressAction, resendVerificationAction, saveAddressAction, sendPhoneCodeAction,
  setPreferenceAction, signOutEverywhereAction, updateProfileAction, verifyPhoneCodeAction,
} from "@/lib/actions/account";

export interface Address { id: string; label: string | null; fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; stateCode: string; pincode: string; isDefault: boolean }

export function ProfileForm({ fullName }: { fullName: string }) {
  return (
    <ActionForm action={updateProfileAction} className="flex flex-wrap items-end gap-3">
      <label className="min-w-60 flex-1 text-sm font-medium">Full name<input name="fullName" defaultValue={fullName} required className={fieldClass} /></label>
      <Submit variant="secondary">Save</Submit>
    </ActionForm>
  );
}

export function ResendVerification() {
  return <ActionForm action={async () => resendVerificationAction()}><Submit variant="secondary" className="h-9 px-4 text-sm">Resend verification email</Submit></ActionForm>;
}

export function PhoneVerify({ phone, verified }: { phone: string | null; verified: boolean }) {
  return (
    <div className="space-y-3">
      <ActionForm action={sendPhoneCodeAction} className="flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1 text-sm font-medium">Mobile number {verified && <span className="font-normal text-success-700">· verified</span>}
          <input name="phone" type="tel" inputMode="numeric" defaultValue={phone ?? ""} required className={fieldClass} /></label>
        <Submit variant="secondary">{verified ? "Change & verify" : "Send code"}</Submit>
      </ActionForm>
      <ActionForm action={verifyPhoneCodeAction} className="flex flex-wrap items-end gap-3">
        <label className="w-40 text-sm font-medium">6-digit code<input name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" className={fieldClass} /></label>
        <Submit variant="secondary">Verify</Submit>
      </ActionForm>
    </div>
  );
}

export function AddressForm({ a }: { a?: Address }) {
  return (
    <ActionForm action={saveAddressAction} className="grid gap-3 sm:grid-cols-2">
      {a && <input type="hidden" name="addressId" value={a.id} />}
      <label className="text-sm font-medium">Label <span className="font-normal text-ink-muted">(Home, Work…)</span><input name="label" defaultValue={a?.label ?? ""} maxLength={30} className={fieldClass} /></label>
      <label className="text-sm font-medium">Full name<input name="fullName" defaultValue={a?.fullName} required className={fieldClass} /></label>
      <label className="text-sm font-medium">Mobile<input name="phone" type="tel" defaultValue={a?.phone} required className={fieldClass} /></label>
      <label className="text-sm font-medium">Flat / house, street<input name="line1" defaultValue={a?.line1} required className={fieldClass} /></label>
      <label className="text-sm font-medium">Area <span className="font-normal text-ink-muted">(optional)</span><input name="line2" defaultValue={a?.line2 ?? ""} className={fieldClass} /></label>
      <label className="text-sm font-medium">Landmark <span className="font-normal text-ink-muted">(optional)</span><input name="landmark" defaultValue={a?.landmark ?? ""} className={fieldClass} /></label>
      <label className="text-sm font-medium">City<input name="city" defaultValue={a?.city} required className={fieldClass} /></label>
      <label className="text-sm font-medium">Pincode<input name="pincode" inputMode="numeric" maxLength={6} defaultValue={a?.pincode} required className={fieldClass} /></label>
      <label className="text-sm font-medium">State<select name="stateCode" defaultValue={a?.stateCode ?? ""} required className={fieldClass}><option value="">Select state</option>{INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
      <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="isDefault" defaultChecked={a?.isDefault} className="size-4 accent-brand-600" />Default address</label>
      <div className="sm:col-span-2"><Submit variant="secondary">{a ? "Save address" : "Add address"}</Submit></div>
    </ActionForm>
  );
}

export function DeleteAddress({ id }: { id: string }) {
  return <ActionForm action={deleteAddressAction}><input type="hidden" name="addressId" value={id} /><button type="submit" className="text-sm font-semibold text-danger-700 hover:underline">Remove</button></ActionForm>;
}

export function PreferenceToggle({ channel, label, on, canEnable, hint }: { channel: string; label: string; on: boolean; canEnable: boolean; hint?: string }) {
  return (
    <ActionForm action={setPreferenceAction} className="flex items-center justify-between gap-4 rounded-xl bg-canvas p-4">
      <input type="hidden" name="channel" value={channel} /><input type="hidden" name="on" value={on ? "0" : "1"} />
      <span><span className="block font-medium">{label}</span><span className="block text-xs text-ink-muted">{on ? "Subscribed" : hint ?? "Not subscribed"}</span></span>
      {on ? <Submit variant="secondary" className="h-9 px-4 text-sm">Unsubscribe</Submit> : <Submit variant="secondary" className="h-9 px-4 text-sm">{canEnable ? "Subscribe" : "Verify first"}</Submit>}
    </ActionForm>
  );
}

export function SignOutEverywhere() {
  return <ActionForm action={async () => signOutEverywhereAction()}><Submit variant="secondary">Sign out of other devices</Submit></ActionForm>;
}

export function DeleteAccount() {
  return (
    <ActionForm action={deleteAccountAction} className="space-y-3">
      <p className="text-sm text-ink-muted">Your profile, addresses, wishlist and marketing consent are removed. Orders and invoices are kept anonymously because tax law requires it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Password<input name="password" type="password" required autoComplete="current-password" className={fieldClass} /></label>
        <label className="text-sm font-medium">Type DELETE<input name="confirm" required className={fieldClass} /></label>
      </div>
      <Submit variant="danger" confirm="Permanently delete your account?">Delete my account</Submit>
    </ActionForm>
  );
}

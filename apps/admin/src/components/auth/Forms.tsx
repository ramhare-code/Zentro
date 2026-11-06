"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  inviteMfaAction, invitePasswordAction, loginAction, mfaAction, reauthAction, type FormState,
} from "@/lib/actions/auth";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn btn-primary h-11 w-full">{pending ? "Please wait…" : children}</button>;
}

function ErrorBox({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return <p role="alert" className="rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm text-bad-700">{state.error}</p>;
}

function CodeInput({ label = "Authentication code" }: { label?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input name="code" required autoFocus autoComplete="one-time-code" inputMode="text" maxLength={20} placeholder="123456"
        className="input mt-1.5 text-center font-mono text-lg tracking-[0.3em]" />
    </label>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium">
        Work email
        <input key={state?.email ?? ""} name="email" type="email" required autoComplete="username" autoFocus={!state?.email} defaultValue={state?.email} className="input mt-1.5" />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input name="password" type="password" required autoComplete="current-password" autoFocus={!!state?.email} className="input mt-1.5" />
      </label>
      <ErrorBox state={state} />
      <Submit>Continue</Submit>
    </form>
  );
}

export function MfaForm({ next }: { next: string }) {
  const [state, action] = useActionState(mfaAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <CodeInput />
      <p className="text-xs text-ink-muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      <ErrorBox state={state} />
      <Submit>Verify and sign in</Submit>
      <Link href="/login" className="block text-center text-sm font-semibold text-brand-700 hover:underline">Start again</Link>
    </form>
  );
}

export function ReauthForm({ next }: { next: string }) {
  const [state, action] = useActionState(reauthAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <CodeInput />
      <ErrorBox state={state} />
      <Submit>Confirm</Submit>
    </form>
  );
}

export function InvitePasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(invitePasswordAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium">
        New password
        <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input mt-1.5" />
        <span className="mt-1 block text-xs font-normal text-ink-muted">At least 12 characters. A passphrase of a few unrelated words is strong and memorable.</span>
      </label>
      <label className="block text-sm font-medium">
        Confirm password
        <input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input mt-1.5" />
      </label>
      <ErrorBox state={state} />
      <Submit>Set password</Submit>
    </form>
  );
}

export function InviteMfaForm({ token, qrSvg, secret }: { token: string; qrSvg: string; secret: string }) {
  const [state, action] = useActionState(inviteMfaAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-ink-muted">Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
      <div className="mx-auto w-fit rounded-xl ring-1 ring-line" role="img" aria-label="QR code for authenticator setup" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-brand-700">Can’t scan? Enter the key manually</summary>
        <code className="mt-2 block break-all rounded-lg bg-canvas p-3 font-mono text-xs">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
      </details>
      <CodeInput label="Code from your app" />
      <ErrorBox state={state} />
      <Submit>Turn on two-step verification</Submit>
    </form>
  );
}

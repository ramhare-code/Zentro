import type { Metadata } from "next";
import { InviteMfaForm, InvitePasswordForm } from "@/components/auth/Forms";
import { decrypt } from "@/lib/crypto";
import { adminEnv } from "@/lib/env";
import { inviteQr, loadInvite } from "@/lib/invite";

export const metadata: Metadata = { title: "Set up your account" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) {
    return (
      <>
        <h1 className="text-xl font-bold">Invitation not valid</h1>
        <p className="mt-2 text-sm text-ink-muted">This link has expired or was already used. Ask the store owner to send a new invitation.</p>
      </>
    );
  }
  if (!invite.hasPassword || !invite.secretEnc) {
    return (
      <>
        <h1 className="text-xl font-bold">Welcome, {invite.fullName}</h1>
        <p className="mb-6 mt-1 text-sm text-ink-muted">Step 1 of 2 — choose a password for <strong>{invite.email}</strong>.</p>
        <InvitePasswordForm token={token} />
      </>
    );
  }
  const secret = decrypt(invite.secretEnc, adminEnv().ADMIN_ENCRYPTION_KEY);
  return (
    <>
      <h1 className="text-xl font-bold">Set up two-step verification</h1>
      <p className="mb-6 mt-1 text-sm text-ink-muted">Step 2 of 2 — required for every staff account.</p>
      <InviteMfaForm token={token} qrSvg={await inviteQr(invite.email, secret)} secret={secret} />
    </>
  );
}

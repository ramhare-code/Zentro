import type { Metadata } from "next";
import { AuthCard } from "@/components/account/AuthCard";
import { ActionForm, fieldClass, Submit } from "@/components/ui/ActionForm";
import { resetPasswordAction } from "@/lib/actions/account";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password" subtitle="You’ll be signed out of all other devices.">
      <ActionForm action={resetPasswordAction} className="space-y-4">
        <input type="hidden" name="token" value={token ?? ""} />
        <label className="block text-sm font-medium">New password<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={fieldClass} /></label>
        <Submit className="w-full">Save password</Submit>
      </ActionForm>
    </AuthCard>
  );
}

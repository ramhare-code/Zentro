import type { Metadata } from "next";
import { AuthCard } from "@/components/account/AuthCard";
import { ActionForm, fieldClass, Submit } from "@/components/ui/ActionForm";
import { forgotPasswordAction } from "@/lib/actions/account";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthCard title="Reset your password" subtitle="We’ll email you a link to choose a new password.">
      <ActionForm action={forgotPasswordAction} className="space-y-4">
        <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="email" className={fieldClass} /></label>
        <Submit className="w-full">Send reset link</Submit>
      </ActionForm>
    </AuthCard>
  );
}

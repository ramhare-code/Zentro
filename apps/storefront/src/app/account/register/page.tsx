import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/account/AuthCard";
import { ActionForm, fieldClass, Submit } from "@/components/ui/ActionForm";
import { registerAction } from "@/lib/actions/account";
import { getCustomer } from "@/lib/customer";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCustomer()) redirect("/account");
  return (
    <AuthCard title="Create your account" subtitle={<>Already have one? <Link href="/account/login" className="font-semibold text-brand-700 underline">Sign in</Link></>}>
      <ActionForm action={registerAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? "/account"} />
        <label className="block text-sm font-medium">Full name<input name="fullName" required autoComplete="name" maxLength={100} className={fieldClass} /></label>
        <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="email" className={fieldClass} /></label>
        <label className="block text-sm font-medium">Password<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={fieldClass} />
          <span className="mt-1 block text-xs font-normal text-ink-muted">At least 10 characters.</span></label>
        <Submit className="w-full">Create account</Submit>
        <p className="text-xs text-ink-muted">By creating an account you agree to our <Link href="/policies/terms" className="underline">terms</Link> and <Link href="/policies/privacy" className="underline">privacy policy</Link>. You can choose marketing messages later — they’re off by default.</p>
      </ActionForm>
    </AuthCard>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/account/AuthCard";
import { ActionForm, fieldClass, Submit } from "@/components/ui/ActionForm";
import { loginAction } from "@/lib/actions/account";
import { getCustomer } from "@/lib/customer";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCustomer()) redirect(next?.startsWith("/") ? next : "/account");
  return (
    <AuthCard title="Sign in" subtitle={<>New to Zentro? <Link href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 underline">Create an account</Link></>}>
      <ActionForm action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? "/account"} />
        <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="email" className={fieldClass} /></label>
        <label className="block text-sm font-medium">Password<input name="password" type="password" required autoComplete="current-password" className={fieldClass} /></label>
        <div className="flex items-center justify-between">
          <Submit>Sign in</Submit>
          <Link href="/account/forgot" className="text-sm font-semibold text-brand-700 hover:underline">Forgot password?</Link>
        </div>
      </ActionForm>
      <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">Ordered as a guest? <Link href="/account/orders" className="font-semibold text-brand-700 underline">Track an order</Link> without signing in.</p>
    </AuthCard>
  );
}

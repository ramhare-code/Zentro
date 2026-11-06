import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account/AuthCard";
import { verifyEmail } from "@/lib/actions/account";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmail(token) : false;
  return (
    <AuthCard title={ok ? "Email verified" : "This link has expired"}>
      <p className="text-ink-muted">{ok ? "Thanks — your email is confirmed. Orders you placed earlier with this email now appear in your account." : "Sign in and request a new verification email from your account page."}</p>
      <Link href="/account" className="mt-6 inline-flex h-11 items-center rounded-full bg-brand-600 px-6 font-semibold text-white">Go to my account</Link>
    </AuthCard>
  );
}

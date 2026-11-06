import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/Forms";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-bold">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-ink-muted">Use your staff account. Two-step verification is required.</p>
      <LoginForm next={next ?? "/dashboard"} />
    </>
  );
}

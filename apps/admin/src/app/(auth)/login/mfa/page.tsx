import type { Metadata } from "next";
import { MfaForm } from "@/components/auth/Forms";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-bold">Two-step verification</h1>
      <p className="mb-6 mt-1 text-sm text-ink-muted">Confirm it’s you.</p>
      <MfaForm next={next ?? "/dashboard"} />
    </>
  );
}

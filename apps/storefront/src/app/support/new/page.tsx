import type { Metadata } from "next";
import { NewTicketForm } from "@/components/support/SupportForms";
import { getCustomer } from "@/lib/customer";

export const metadata: Metadata = { title: "Contact support", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const c = await getCustomer();
  const { order } = await searchParams;
  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Contact support</h1>
      <p className="mb-6 mt-2 text-ink-muted">We reply by email, usually within one working day. You’ll get a private link to follow your request.</p>
      <div className="rounded-card bg-white p-5 ring-1 ring-line sm:p-6"><NewTicketForm name={c?.fullName} email={c?.email} orderNumber={order?.slice(0, 30)} /></div>
    </div>
  );
}

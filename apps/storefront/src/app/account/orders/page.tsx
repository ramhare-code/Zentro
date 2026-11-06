import type { Metadata } from "next";
import { LookupForm } from "@/components/order/LookupForm";

export const metadata: Metadata = { title: "Track your order", robots: { index: false } };

export default function OrdersLookupPage() {
  return (
    <div className="container-page max-w-md py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Track your order</h1>
      <p className="mb-6 mt-2 text-ink-muted">Enter the details you used at checkout. The link in your confirmation message also opens your order directly.</p>
      <LookupForm />
    </div>
  );
}

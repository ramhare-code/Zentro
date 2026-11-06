import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function Page() {
  return <ComingSoon title="Your cart" text="The shopping cart is being enabled." />;
}

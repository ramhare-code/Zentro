import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default function Page() {
  return <ComingSoon title="My orders" text="Order history and tracking will appear here once checkout is enabled." />;
}

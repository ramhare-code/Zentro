import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function Page() {
  return <ComingSoon title="My account" text="Sign-in, profiles and saved addresses are being enabled." />;
}

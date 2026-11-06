import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function Page() {
  return <ComingSoon title="Wishlist" text="Saving favourites is being enabled." />;
}

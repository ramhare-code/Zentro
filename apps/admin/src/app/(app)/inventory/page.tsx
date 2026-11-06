import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Inventory" };

export default async function Page() {
  await requirePermission("inventory.read");
  return <Scheduled title={"Inventory"} phase={3} items={["Stock across all variants with thresholds", "Logged stock adjustments and movement history", "Reservations and reconciliation"]} />;
}

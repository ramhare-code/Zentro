import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Purchase orders" };

export default async function Page() {
  await requirePermission("purchase_orders.manage");
  return <Scheduled title={"Purchase orders"} phase={3} items={["Create purchase orders", "Receive stock against POs"]} />;
}

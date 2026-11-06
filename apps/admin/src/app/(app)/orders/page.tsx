import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Orders" };

export default async function Page() {
  await requirePermission("orders.read");
  return <Scheduled title={"Orders"} phase={4} items={["Searchable, filterable order list", "Order detail with payment and fulfilment state", "Validated status transitions, cancellation, notes, audit trail", "Shipping labels and tracking sync"]} />;
}

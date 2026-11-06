import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Finance" };

export default async function Page() {
  await requirePermission("finance.read");
  return <Scheduled title={"Finance"} phase={6} items={["Sales, refund, GST and settlement summaries", "Invoices and tax configuration", "Permission-controlled exports"]} />;
}

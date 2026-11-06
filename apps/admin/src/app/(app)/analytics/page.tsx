import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Analytics" };

export default async function Page() {
  await requirePermission("analytics.read");
  return <Scheduled title={"Analytics"} phase={6} items={["Sales, AOV and trends with date/category/product filters", "Product and category performance", "Acquisition, repeat purchase and funnel conversion", "CSV/XLSX report exports"]} />;
}

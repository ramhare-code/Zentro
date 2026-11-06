import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Promotions" };

export default async function Page() {
  await requirePermission("marketing.manage");
  return <Scheduled title={"Promotions"} phase={5} items={["Product and category discounts", "Scheduled campaigns"]} />;
}

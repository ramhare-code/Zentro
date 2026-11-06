import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Banners" };

export default async function Page() {
  await requirePermission("marketing.manage");
  return <Scheduled title={"Banners"} phase={5} items={["Homepage banners with schedules", "Featured products and content pages"]} />;
}

import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Brands" };

export default async function Page() {
  await requirePermission("catalog.manage");
  return <Scheduled title={"Brands"} phase={2} items={["Brands with logos", "Archive brands safely"]} />;
}

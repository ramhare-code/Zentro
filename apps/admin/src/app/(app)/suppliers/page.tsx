import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Suppliers" };

export default async function Page() {
  await requirePermission("suppliers.manage");
  return <Scheduled title={"Suppliers"} phase={3} items={["Supplier records and contacts"]} />;
}

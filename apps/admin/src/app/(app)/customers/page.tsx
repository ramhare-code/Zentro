import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Customers" };

export default async function Page() {
  await requirePermission("customers.read");
  return <Scheduled title={"Customers"} phase={5} items={["Customer directory with masked contact details", "Profiles, purchase and support history", "Account restrictions and privacy requests"]} />;
}

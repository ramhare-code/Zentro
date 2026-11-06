import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function Page() {
  await requirePermission("settings.manage");
  return <Scheduled title={"Settings"} phase={7} items={["Store details, policies, shipping rules", "Integrations"]} />;
}

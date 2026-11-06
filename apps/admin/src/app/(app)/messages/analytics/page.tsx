import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Campaign analytics" };

export default async function Page() {
  await requirePermission("messages.read");
  return <Scheduled title={"Campaign analytics"} phase={5} items={["Audience, delivery and attributable results"]} />;
}

import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Campaigns" };

export default async function Page() {
  await requirePermission("messages.campaigns");
  return <Scheduled title={"Campaigns"} phase={5} items={["Audience by consent and segment", "Eligible count and cost estimate before sending", "Approval for large campaigns"]} />;
}

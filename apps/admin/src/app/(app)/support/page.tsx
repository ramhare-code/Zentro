import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Support" };

export default async function Page() {
  await requirePermission("support.manage");
  return <Scheduled title={"Support"} phase={5} items={["Ticket queue with assignment and priority", "Replies and resolution"]} />;
}

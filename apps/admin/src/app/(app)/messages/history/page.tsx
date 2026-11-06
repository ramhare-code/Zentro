import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Message history" };

export default async function Page() {
  await requirePermission("messages.read");
  return <Scheduled title={"Message history"} phase={5} items={["Every attempt with provider ID, timestamps and status"]} />;
}

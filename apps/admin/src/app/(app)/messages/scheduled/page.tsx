import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Scheduled campaigns" };

export default async function Page() {
  await requirePermission("messages.campaigns");
  return <Scheduled title={"Scheduled campaigns"} phase={5} items={["Future sends within permitted delivery windows"]} />;
}

import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Compose message" };

export default async function Page() {
  await requirePermission("messages.send");
  return <Scheduled title={"Compose message"} phase={5} items={["Send a service message to one customer", "Template preview with personalisation", "Test send"]} />;
}

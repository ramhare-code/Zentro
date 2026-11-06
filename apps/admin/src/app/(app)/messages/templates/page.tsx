import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Message templates" };

export default async function Page() {
  await requirePermission("messages.templates");
  return <Scheduled title={"Message templates"} phase={5} items={["DLT template IDs and WhatsApp approval status", "Approved variables"]} />;
}

import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Messaging providers" };

export default async function Page() {
  await requirePermission("messages.settings");
  return <Scheduled title={"Messaging providers"} phase={5} items={["SMS and WhatsApp provider configuration (secrets stay in environment variables)"]} />;
}

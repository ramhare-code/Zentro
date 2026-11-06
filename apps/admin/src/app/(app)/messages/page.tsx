import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Customer messaging" };

export default async function Page() {
  await requirePermission("messages.read");
  return <Scheduled title={"Customer messaging"} phase={5} items={["Communication centre overview", "Individual service messages and promotional campaigns (SMS / WhatsApp)", "DLT-registered SMS templates and approved WhatsApp templates", "Consent records, unsubscribe and frequency limits", "Delivery reports, costs and campaign analytics"]} />;
}

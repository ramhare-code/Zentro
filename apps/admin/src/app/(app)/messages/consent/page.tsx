import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Consent & unsubscribes" };

export default async function Page() {
  await requirePermission("messages.consent");
  return <Scheduled title={"Consent & unsubscribes"} phase={5} items={["Channel-specific consent records", "Immediate suppression on opt-out"]} />;
}

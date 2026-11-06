import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Refunds" };

export default async function Page() {
  await requirePermission("refunds.create");
  return <Scheduled title={"Refunds"} phase={4} items={["Refunds via the Razorpay API with step-up verification", "Provider-confirmed refund status"]} />;
}

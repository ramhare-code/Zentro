import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payments" };

export default async function Page() {
  await requirePermission("payments.read");
  return <Scheduled title={"Payments"} phase={4} items={["Verified payment records from Razorpay", "Failures, pending payments, reconciliation"]} />;
}

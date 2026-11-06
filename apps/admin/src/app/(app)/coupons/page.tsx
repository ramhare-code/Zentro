import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Coupons" };

export default async function Page() {
  await requirePermission("marketing.manage");
  return <Scheduled title={"Coupons"} phase={5} items={["Coupons with eligibility, validity and usage limits", "Redemption reporting"]} />;
}

import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Reviews" };

export default async function Page() {
  await requirePermission("reviews.moderate");
  return <Scheduled title={"Reviews"} phase={5} items={["Moderation queue with transparent reasons"]} />;
}

import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Categories" };

export default async function Page() {
  await requirePermission("catalog.manage");
  return <Scheduled title={"Categories"} phase={2} items={["Category tree with drag ordering", "Visibility scheduling and SEO fields", "Hierarchy validation"]} />;
}

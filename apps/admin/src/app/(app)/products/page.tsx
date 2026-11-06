import { Scheduled } from "@/components/Scheduled";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Products" };

export default async function Page() {
  await requirePermission("products.read");
  return <Scheduled title={"Products"} phase={2} items={["Create, edit, archive products", "Images and videos (upload, reorder, replace)", "Variants, specifications, visibility and scheduling", "CSV bulk import and bulk actions"]} />;
}

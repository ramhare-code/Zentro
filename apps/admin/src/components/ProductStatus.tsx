import clsx from "clsx";
import type { ProductStatus } from "@/lib/catalog-admin";

const tone: Record<ProductStatus, string> = { published: "bg-good-50 text-good-700", scheduled: "bg-info-50 text-info-700", draft: "bg-canvas text-ink-muted", archived: "bg-bad-50 text-bad-700" };
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize", tone[status])}>{status}</span>;
}

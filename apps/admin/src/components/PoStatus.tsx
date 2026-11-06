import clsx from "clsx";

export const PO_LABELS: Record<string, string> = { draft: "Draft", ordered: "Ordered", partially_received: "Partly received", received: "Received", closed: "Closed", cancelled: "Cancelled" };
const tone: Record<string, string> = { draft: "bg-canvas text-ink-muted", ordered: "bg-info-50 text-info-700", partially_received: "bg-warn-50 text-warn-700", received: "bg-good-50 text-good-700", closed: "bg-canvas text-ink-muted", cancelled: "bg-canvas text-ink-subtle" };
export function PoStatus({ status }: { status: string }) {
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone[status])}>{PO_LABELS[status] ?? status}</span>;
}

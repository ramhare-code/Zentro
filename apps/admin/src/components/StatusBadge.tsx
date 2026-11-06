import clsx from "clsx";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@zentro/commerce";

const tone: Record<string, string> = {
  pending_payment: "bg-warn-50 text-warn-700", payment_failed: "bg-bad-50 text-bad-700", confirmed: "bg-info-50 text-info-700",
  processing: "bg-info-50 text-info-700", packed: "bg-info-50 text-info-700", shipped: "bg-brand-50 text-brand-700",
  out_for_delivery: "bg-brand-50 text-brand-700", delivered: "bg-good-50 text-good-700", cancelled: "bg-canvas text-ink-muted",
  return_requested: "bg-warn-50 text-warn-700", returned: "bg-canvas text-ink-muted",
};
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone[status])}>{ORDER_STATUS_LABELS[status]}</span>;
}
const payTone: Record<string, string> = { paid: "text-good-700", pending: "text-warn-700", failed: "text-bad-700", refund_pending: "text-warn-700", refunded: "text-ink-muted", partially_refunded: "text-warn-700" };
export function PaymentLabel({ status }: { status: string }) {
  return <span className={clsx("text-xs font-semibold", payTone[status])}>{status.replace(/_/g, " ")}</span>;
}

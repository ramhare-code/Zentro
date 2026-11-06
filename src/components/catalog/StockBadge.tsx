import clsx from "clsx";
import { stockLabel, stockState } from "@/lib/stock";

export function StockBadge({ stock, className }: { stock: number; className?: string }) {
  const state = stockState(stock);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        state === "in_stock" && "text-success-700",
        state === "low_stock" && "text-warning-700",
        state === "out_of_stock" && "text-danger-700",
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "size-2 rounded-full",
          state === "in_stock" && "bg-success-700",
          state === "low_stock" && "bg-warning-700",
          state === "out_of_stock" && "bg-danger-700",
        )}
      />
      {stockLabel(stock)}
    </span>
  );
}

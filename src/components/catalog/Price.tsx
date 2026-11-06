import clsx from "clsx";
import { discountPercent, formatPaise } from "@/lib/money";

export function Price({
  pricePaise,
  mrpPaise,
  fromPrice = false,
  size = "md",
  className,
}: {
  pricePaise: number;
  mrpPaise: number;
  fromPrice?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const off = discountPercent(mrpPaise, pricePaise);
  return (
    <div className={clsx("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className={clsx("font-bold text-ink", size === "lg" ? "text-3xl" : "text-lg")}>
        {fromPrice && <span className="mr-1 text-sm font-medium text-ink-muted">From</span>}
        {formatPaise(pricePaise)}
      </span>
      {off > 0 && (
        <>
          <span className={clsx("text-ink-subtle line-through", size === "lg" ? "text-base" : "text-sm")}>
            <span className="sr-only">MRP </span>
            {formatPaise(mrpPaise)}
          </span>
          <span className={clsx("font-semibold text-success-700", size === "lg" ? "text-base" : "text-sm")}>{off}% off</span>
        </>
      )}
    </div>
  );
}

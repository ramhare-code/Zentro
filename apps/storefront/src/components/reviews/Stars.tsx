import clsx from "clsx";
import { StarIcon } from "../icons";

/** Five stars with partial fill, e.g. 4.3 → four full and a third of the fifth. */
export function Stars({ rating, size = 16, className }: { rating: number; size?: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center", className)} role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
            <StarIcon size={size} className="absolute inset-0 text-line-strong" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarIcon size={size} className="text-accent-500" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

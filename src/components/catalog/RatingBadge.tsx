import clsx from "clsx";
import { StarIcon } from "../icons";

/** Shows genuine ratings only. Renders nothing when there are no published reviews. */
export function RatingBadge({ avg, count, className }: { avg: number; count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <div className={clsx("flex items-center gap-1.5 text-sm", className)}>
      <span className="inline-flex items-center gap-0.5 rounded-md bg-success-700 px-1.5 py-0.5 text-xs font-bold text-white">
        {avg.toFixed(1)}
        <StarIcon size={11} />
      </span>
      <span className="text-ink-muted">
        ({count.toLocaleString("en-IN")}
        <span className="sr-only"> ratings</span>)
      </span>
    </div>
  );
}

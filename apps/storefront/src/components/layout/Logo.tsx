import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { BrandMark } from "./BrandMark";

/** Header/footer logo. Proportions match the intro (mark 1em, word 0.555em, gap 0.222em). */
export function Logo({ className = "", id = "logo" }: { className?: string; id?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`} aria-label={`${SITE_NAME} home`} data-brand>
      <BrandMark id={id} className="size-9 shrink-0 rounded-xl shadow-card" />
      <span className="font-display text-xl font-extrabold tracking-tight text-ink" data-brand-word>{SITE_NAME}</span>
    </Link>
  );
}

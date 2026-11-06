import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`} aria-label={`${SITE_NAME} home`}>
      <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 font-display text-lg font-extrabold text-white shadow-card">
        Z
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-ink">{SITE_NAME}</span>
    </Link>
  );
}

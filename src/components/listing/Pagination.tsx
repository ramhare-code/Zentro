import Link from "next/link";
import clsx from "clsx";
import { listingQueryString, type ListingFilters } from "@/lib/listing-params";
import { ChevronLeft, ChevronRight } from "../icons";

export function Pagination({ basePath, filters, page, pageCount }: { basePath: string; filters: ListingFilters; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => `${basePath}${listingQueryString(filters, { page: p })}`;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  const item = "grid size-10 place-items-center rounded-full text-sm font-semibold";
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={clsx(item, "bg-white ring-1 ring-line hover:bg-brand-50")} aria-label="Previous page"><ChevronLeft size={18} /></Link>
      ) : (
        <span className={clsx(item, "text-ink-subtle")} aria-hidden><ChevronLeft size={18} /></span>
      )}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1 text-ink-subtle">…</span>}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={clsx(item, p === page ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line hover:bg-brand-50")}>
            {p}
          </Link>
        </span>
      ))}
      {page < pageCount ? (
        <Link href={href(page + 1)} rel="next" className={clsx(item, "bg-white ring-1 ring-line hover:bg-brand-50")} aria-label="Next page"><ChevronRight size={18} /></Link>
      ) : (
        <span className={clsx(item, "text-ink-subtle")} aria-hidden><ChevronRight size={18} /></span>
      )}
    </nav>
  );
}

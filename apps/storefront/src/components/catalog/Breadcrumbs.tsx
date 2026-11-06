import Link from "next/link";
import { ChevronRight } from "../icons";

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="text-ink-subtle" />}
            {item.href ? (
              <Link href={item.href} className="hover:text-brand-700 hover:underline">{item.name}</Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">{item.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

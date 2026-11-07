import Link from "next/link";
import { BANNER_COLS, type BannerRow } from "@/components/marketing/BannerFields";
import { MarketingNav, scheduleState, StateBadge } from "@/components/marketing/MarketingNav";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { mediaSrc } from "@/lib/media";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Banners" };

export default async function BannersPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requirePermission("marketing.manage");
  const sql = db();
  const rows = await sql<BannerRow[]>`select ${sql.unsafe(BANNER_COLS)} from shop.banners b left join shop.categories c on c.id = b.category_id order by b.placement, c.name nulls first, b.sort_order, b.created_at desc`;
  const deleted = (await searchParams).deleted === "1";
  const groups = [["home", "Homepage carousel"], ["category", "Category pages"]] as const;
  return (
    <div className="space-y-5">
      <MarketingNav active="/banners" title="Banners"><Link href="/banners/new" className="btn btn-primary">New banner</Link></MarketingNav>
      {deleted && <p role="status" className="rounded-xl bg-good-50 px-4 py-3 text-sm text-good-700">Banner deleted.</p>}
      {groups.map(([key, label]) => {
        const list = rows.filter((r) => r.placement === key);
        return (
          <section key={key} aria-label={label} className="card p-5">
            <h2 className="font-semibold">{label}</h2>
            {key === "home" && <p className="text-xs text-ink-muted">Up to 6 live banners rotate on the homepage, in order.</p>}
            {list.length === 0 ? <p className="mt-3 text-sm text-ink-muted">None.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {list.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-4 py-3">
                    <img src={mediaSrc(b.imageUrl)} alt="" className="h-14 w-32 rounded-lg object-cover ring-1 ring-line" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/banners/${b.id}`} className="font-semibold text-brand-700 hover:underline">{b.title}</Link>
                      <p className="text-xs text-ink-muted">{b.categoryName && `${b.categoryName} · `}order {b.sortOrder}{b.startsAt && ` · from ${formatDateTime(b.startsAt)}`}{b.endsAt && ` · until ${formatDateTime(b.endsAt)}`}</p>
                    </div>
                    <StateBadge state={scheduleState(b)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { BANNER_COLS, BannerFields, type BannerRow } from "@/components/marketing/BannerFields";
import { MarketingNav, scheduleState, StateBadge } from "@/components/marketing/MarketingNav";
import { deleteBannerAction, saveBannerAction } from "@/lib/actions/marketing";
import { catalogOptions } from "@/lib/catalog-admin";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Banner" };

export default async function BannerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePermission("marketing.manage");
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const sql = db();
  const [[b], { categories }] = await Promise.all([
    sql<BannerRow[]>`select ${sql.unsafe(BANNER_COLS)} from shop.banners b left join shop.categories c on c.id = b.category_id where b.id = ${id}`,
    catalogOptions(),
  ]);
  if (!b) notFound();
  return (
    <div className="space-y-5">
      <MarketingNav active="/banners" title={b.title}><StateBadge state={scheduleState(b)} /></MarketingNav>
      {(await searchParams).created === "1" && <p role="status" className="rounded-xl bg-good-50 px-4 py-3 text-sm text-good-700">Banner created. The storefront refreshes within a few minutes.</p>}
      <ActionForm action={saveBannerAction} className="card max-w-3xl space-y-4 p-5"><BannerFields b={b} categories={categories} /><SubmitButton>Save changes</SubmitButton></ActionForm>
      <ActionForm action={deleteBannerAction} className="card flex max-w-3xl flex-wrap items-center gap-3 p-4 text-sm">
        <input type="hidden" name="bannerId" value={b.id} />
        <p className="flex-1 text-ink-muted">Delete the banner and its uploaded images.</p>
        <SubmitButton variant="danger" confirm="Delete this banner?">Delete banner</SubmitButton>
      </ActionForm>
    </div>
  );
}

import { notFound } from "next/navigation";
import { z } from "zod";
import { formatPaise } from "@zentro/commerce";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CouponFields } from "@/components/marketing/CouponFields";
import { MarketingNav, scheduleState, StateBadge } from "@/components/marketing/MarketingNav";
import { archiveCouponAction, saveCouponAction } from "@/lib/actions/marketing";
import { catalogOptions } from "@/lib/catalog-admin";
import { getCoupon, slugsFor } from "@/lib/marketing";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Coupon" };

export default async function CouponPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePermission("marketing.manage");
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const [c, { categories }] = await Promise.all([getCoupon(id), catalogOptions()]);
  if (!c) notFound();
  const created = (await searchParams).created === "1";
  return (
    <div className="space-y-5">
      <MarketingNav active="/coupons" title={c.code}><StateBadge state={scheduleState(c)} /></MarketingNav>
      {created && <p role="status" className="rounded-xl bg-good-50 px-4 py-3 text-sm text-good-700">Coupon created.{c.isPublic ? " It’s listed as an offer at checkout." : " Share the code with customers, or add it to a messaging campaign."}</p>}
      <section aria-label="Coupon results" className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-ink-muted">Paid orders</p><p className="mt-1 text-2xl font-bold tabular-nums">{c.orders}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-muted">Discount given</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatPaise(c.discountGivenPaise)}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-muted">Order value</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatPaise(c.revenuePaise)}</p></div>
      </section>
      {!c.archivedAt && <ActionForm action={saveCouponAction} className="card max-w-3xl space-y-4 p-5"><CouponFields c={c} categories={categories} productSlugs={await slugsFor(c.productIds)} /><SubmitButton>Save changes</SubmitButton></ActionForm>}
      <ActionForm action={archiveCouponAction} className="card flex max-w-3xl flex-wrap items-center gap-3 p-4 text-sm">
        <input type="hidden" name="couponId" value={c.id} />
        <p className="flex-1 text-ink-muted">{c.archivedAt ? "Archived coupons can’t be used." : "Archive to retire the code for good. Past orders keep their discount."}</p>
        {c.archivedAt ? <SubmitButton name="op" value="restore" variant="secondary">Restore</SubmitButton> : <SubmitButton name="op" value="archive" variant="danger" confirm={`Archive ${c.code}? Customers will no longer be able to use it.`}>Archive</SubmitButton>}
      </ActionForm>
    </div>
  );
}

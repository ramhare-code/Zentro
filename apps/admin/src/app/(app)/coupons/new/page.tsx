import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CouponFields } from "@/components/marketing/CouponFields";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { saveCouponAction } from "@/lib/actions/marketing";
import { catalogOptions } from "@/lib/catalog-admin";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New coupon" };

export default async function NewCouponPage() {
  await requirePermission("marketing.manage");
  const { categories } = await catalogOptions();
  return (
    <div className="space-y-5">
      <MarketingNav active="/coupons" title="New coupon" />
      <ActionForm action={saveCouponAction} className="card max-w-3xl space-y-4 p-5"><CouponFields categories={categories} /><SubmitButton>Create coupon</SubmitButton></ActionForm>
    </div>
  );
}

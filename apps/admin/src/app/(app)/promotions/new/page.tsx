import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PromotionFields } from "@/components/marketing/PromotionFields";
import { savePromotionAction } from "@/lib/actions/marketing";
import { catalogOptions } from "@/lib/catalog-admin";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New promotion" };

export default async function NewPromotionPage() {
  await requirePermission("marketing.manage");
  const { categories, brands } = await catalogOptions();
  return (
    <div className="space-y-5">
      <MarketingNav active="/promotions" title="New promotion" />
      <ActionForm action={savePromotionAction} className="card max-w-3xl space-y-4 p-5"><PromotionFields categories={categories} brands={brands.filter((b) => b.isActive)} /><SubmitButton>Create promotion</SubmitButton></ActionForm>
    </div>
  );
}

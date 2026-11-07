import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { BannerFields } from "@/components/marketing/BannerFields";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { saveBannerAction } from "@/lib/actions/marketing";
import { catalogOptions } from "@/lib/catalog-admin";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New banner" };

export default async function NewBannerPage() {
  await requirePermission("marketing.manage");
  const { categories } = await catalogOptions();
  return (
    <div className="space-y-5">
      <MarketingNav active="/banners" title="New banner" />
      <ActionForm action={saveBannerAction} className="card max-w-3xl space-y-4 p-5"><BannerFields categories={categories} /><SubmitButton>Create banner</SubmitButton></ActionForm>
    </div>
  );
}

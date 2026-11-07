import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ContentEditor } from "@/components/content/ContentEditor";
import { PageMetaFields } from "@/components/content/PageMetaFields";
import { savePageAction } from "@/lib/actions/content";
import { placeholderValues } from "@/lib/content-admin";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "New page" };

export default async function NewContentPage() {
  await requirePermission("marketing.manage");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">New page</h1>
      <ActionForm action={savePageAction} className="card space-y-4 p-5">
        <PageMetaFields />
        <ContentEditor initial={"## Our story\n\nWrite about your business here."} values={placeholderValues()} />
        <SubmitButton>Save draft</SubmitButton>
      </ActionForm>
    </div>
  );
}

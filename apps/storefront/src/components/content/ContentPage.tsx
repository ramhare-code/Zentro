import { fillPlaceholders } from "@zentro/commerce/content";
import type { PublishedPage } from "@/lib/content";
import { placeholderValues } from "@/lib/content";
import { RichText } from "./RichText";

export async function ContentPage({ page }: { page: PublishedPage }) {
  const values = await placeholderValues();
  return (
    <article className="container-page max-w-3xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">{page.title}</h1>
      {page.summary && <p className="mt-2 text-ink-muted">{fillPlaceholders(page.summary, values)}</p>}
      <div className="mt-8 rounded-card bg-white p-6 ring-1 ring-line sm:p-8"><RichText body={page.body} values={values} /></div>
      <p className="mt-4 text-xs text-ink-subtle">Last updated {page.publishedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
    </article>
  );
}

export async function pageMetadata(page: PublishedPage | null, path: string) {
  if (!page) return {};
  const values = await placeholderValues();
  return { title: page.seoTitle || page.title, description: fillPlaceholders(page.seoDescription || page.summary || "", values) || undefined, alternates: { canonical: path } };
}

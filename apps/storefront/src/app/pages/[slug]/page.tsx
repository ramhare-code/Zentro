import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage, pageMetadata } from "@/components/content/ContentPage";
import { getPublishedPage } from "@/lib/content";

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata(await getPublishedPage("page", slug), `/pages/${slug}`);
}

export default async function InfoPage({ params }: Props) {
  const page = await getPublishedPage("page", (await params).slug);
  if (!page) notFound();
  return <ContentPage page={page} />;
}

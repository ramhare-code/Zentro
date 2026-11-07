import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage, pageMetadata } from "@/components/content/ContentPage";
import { getPublishedPage } from "@/lib/content";

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata(await getPublishedPage("policy", slug), `/policies/${slug}`);
}

export default async function PolicyPage({ params }: Props) {
  const page = await getPublishedPage("policy", (await params).slug);
  if (!page) notFound();
  return <ContentPage page={page} />;
}

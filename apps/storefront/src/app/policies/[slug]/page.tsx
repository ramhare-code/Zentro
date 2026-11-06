import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POLICIES } from "@/content/policies";
import { businessInfo } from "@/lib/env";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(POLICIES).map((slug) => ({ slug }));
}

function fill(text: string) {
  const b = businessInfo();
  return text
    .replaceAll("{business}", b.name)
    .replaceAll("{email}", b.supportEmail ?? "our support team via the Contact page")
    .replaceAll("{returnDays}", String(Number(process.env.RETURN_WINDOW_DAYS) || 7));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const policy = POLICIES[(await params).slug];
  return policy ? { title: policy.title, description: fill(policy.summary), alternates: { canonical: `/policies/${(await params).slug}` } } : {};
}

export default async function PolicyPage({ params }: Props) {
  const policy = POLICIES[(await params).slug];
  if (!policy) notFound();
  return (
    <article className="container-page max-w-3xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">{policy.title}</h1>
      <p className="mt-2 text-ink-muted">{fill(policy.summary)}</p>
      <div className="mt-8 space-y-6 rounded-card bg-white p-6 ring-1 ring-line sm:p-8">
        {policy.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-lg font-bold">{s.heading}</h2>
            <p className="mt-2 leading-relaxed text-ink-muted">{fill(s.body)}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

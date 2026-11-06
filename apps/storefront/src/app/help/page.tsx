import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

export const revalidate = 300;
export const metadata: Metadata = { title: "Help centre", alternates: { canonical: "/help" } };

export default async function HelpPage() {
  const faqs = await db()<{ id: string; topic: string; question: string; answer: string }[]>`
    select id, topic, question, answer from shop.faqs where is_active order by topic, sort_order`;
  const topics = [...new Set(faqs.map((f) => f.topic))];
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Help centre</h1>
      <p className="mt-2 text-ink-muted">
        Answers to common questions. Can’t find what you need? <Link href="/support/new" className="font-semibold text-brand-700 hover:underline">Send us a request</Link> and we’ll reply by email.
      </p>
      {topics.map((t) => (
        <section key={t} aria-labelledby={`t-${t}`} className="mt-8">
          <h2 id={`t-${t}`} className="font-display text-xl font-bold">{t}</h2>
          <div className="mt-3 divide-y divide-line rounded-card bg-white ring-1 ring-line">
            {faqs.filter((f) => f.topic === t).map((f) => (
              <details key={f.id} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-4">{f.question}<span aria-hidden className="text-brand-700 transition group-open:rotate-45">+</span></span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

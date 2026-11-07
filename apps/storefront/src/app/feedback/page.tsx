import type { Metadata } from "next";
import { ActionForm, fieldClass, Submit } from "@/components/ui/ActionForm";
import { sendFeedbackAction } from "@/lib/actions/feedback";
import { getCustomer } from "@/lib/customer";

export const metadata: Metadata = { title: "Send feedback", robots: { index: false }, alternates: { canonical: "/feedback" } };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const from = (await searchParams).from;
  const customer = await getCustomer();
  const kinds = [["problem", "Something isn’t working"], ["suggestion", "An idea or suggestion"], ["praise", "Something I liked"], ["other", "Something else"]] as const;
  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Tell us what you think</h1>
      <p className="mt-2 text-ink-muted">Feedback about the website goes straight to our team. For help with an order, <a href="/support/new" className="font-semibold text-brand-700 underline">contact support</a> instead so we can reply properly.</p>
      <ActionForm action={sendFeedbackAction} className="mt-6 space-y-5 rounded-card bg-white p-6 ring-1 ring-line">
        <input type="hidden" name="page" value={from && from.startsWith("/") ? from : ""} />
        <fieldset>
          <legend className="text-sm font-semibold">What’s it about?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {kinds.map(([v, label]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-xl p-3 ring-1 ring-line-strong has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-500">
                <input type="radio" name="kind" value={v} required className="size-4 accent-brand-600" /> <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">How was your experience? <span className="font-normal text-ink-muted">(optional)</span></legend>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer">
                <input type="radio" name="rating" value={n} className="peer sr-only" />
                <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-canvas text-sm font-bold ring-1 ring-line-strong peer-checked:bg-accent-400 peer-checked:ring-accent-500 peer-focus-visible:outline-3 peer-focus-visible:outline-brand-500">{n}★</span>
                <span className="sr-only">{n} out of 5</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">Your feedback<textarea name="message" required minLength={5} maxLength={2000} rows={5} className={`${fieldClass} h-auto py-2`} /></label>
        {!customer && <label className="block text-sm font-medium">Email <span className="font-normal text-ink-muted">(optional — only if you’d like a reply)</span><input type="email" name="email" autoComplete="email" className={fieldClass} /></label>}
        <div aria-hidden className="hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <Submit>Send feedback</Submit>
      </ActionForm>
    </div>
  );
}

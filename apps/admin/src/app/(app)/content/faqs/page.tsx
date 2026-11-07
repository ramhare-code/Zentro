import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { deleteFaqAction, saveFaqAction } from "@/lib/actions/content";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "FAQs" };

interface Faq { id: string; topic: string; question: string; answer: string; sortOrder: number; isActive: boolean }

function Fields({ q, topics }: { q?: Faq; topics: string[] }) {
  return (
    <div className="space-y-3">
      {q && <input type="hidden" name="faqId" value={q.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className="text-sm font-medium">Topic<input name="topic" required list="faq-topics" maxLength={60} defaultValue={q?.topic} className="input mt-1.5" /></label>
        <label className="text-sm font-medium">Order<input name="sortOrder" inputMode="numeric" defaultValue={q?.sortOrder ?? 0} className="input mt-1.5" /></label>
      </div>
      <datalist id="faq-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
      <label className="block text-sm font-medium">Question<input name="question" required maxLength={200} defaultValue={q?.question} className="input mt-1.5" /></label>
      <label className="block text-sm font-medium">Answer<textarea name="answer" required rows={3} maxLength={4000} defaultValue={q?.answer} className="input mt-1.5 h-auto py-2" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={q?.isActive ?? true} className="size-4" /> Show in the help centre</label>
    </div>
  );
}

export default async function FaqsPage() {
  await requirePermission("marketing.manage");
  const faqs = await db()<Faq[]>`select id, topic, question, answer, sort_order as "sortOrder", is_active as "isActive" from shop.faqs order by topic, sort_order, question`;
  const topics = [...new Set(faqs.map((f) => f.topic))];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Help centre FAQs</h1>
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem] lg:items-start">
        <div className="space-y-5">
          {topics.map((t) => (
            <section key={t} aria-label={t} className="space-y-2">
              <h2 className="font-semibold">{t}</h2>
              {faqs.filter((f) => f.topic === t).map((f) => (
                <details key={f.id} className="card">
                  <summary className="cursor-pointer p-4 text-sm font-medium">{f.question}{!f.isActive && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">Hidden</span>}</summary>
                  <div className="border-t border-line p-4">
                    <ActionForm action={saveFaqAction}><Fields q={f} topics={topics} /><div className="mt-3"><SubmitButton>Save</SubmitButton></div></ActionForm>
                    <ActionForm action={deleteFaqAction} className="mt-2"><input type="hidden" name="faqId" value={f.id} /><SubmitButton variant="secondary" confirm="Delete this question?">Delete</SubmitButton></ActionForm>
                  </div>
                </details>
              ))}
            </section>
          ))}
          {faqs.length === 0 && <p className="card p-8 text-center text-sm text-ink-muted">No questions yet.</p>}
        </div>
        <section aria-labelledby="add-faq" className="card p-5">
          <h2 id="add-faq" className="font-semibold">Add a question</h2>
          <ActionForm action={saveFaqAction} className="mt-3"><Fields topics={topics} /><div className="mt-3"><SubmitButton>Add question</SubmitButton></div></ActionForm>
        </section>
      </div>
    </div>
  );
}

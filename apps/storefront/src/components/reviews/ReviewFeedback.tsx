"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { reportReviewAction, voteHelpfulAction } from "@/lib/actions/engage";
import { REPORT_REASONS } from "@/lib/review-reasons";
import { FlagIcon, ThumbUpIcon } from "../icons";

/** "Helpful" and "Report" under a review. Both need a signed-in customer. */
export function ReviewFeedback({ reviewId, helpfulCount, returnTo }: { reviewId: string; helpfulCount: number; returnTo: string }) {
  const router = useRouter();
  const [count, setCount] = useState(helpfulCount);
  const [voted, setVoted] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [pending, start] = useTransition();
  const login = () => router.push(`/account/login?next=${encodeURIComponent(returnTo)}`);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {count > 0 && <span className="text-ink-muted">{count.toLocaleString("en-IN")} {count === 1 ? "person" : "people"} found this helpful</span>}
      <button
        type="button"
        disabled={pending}
        aria-pressed={voted}
        onClick={() => start(async () => {
          const r = await voteHelpfulAction(reviewId);
          if (r.needsLogin) return login();
          if (!r.ok) return setMsg(r.error ?? "Something went wrong.");
          setVoted(!!r.voted); setCount(r.count ?? count); setMsg(r.voted ? "Thanks for your feedback." : null);
        })}
        className={clsx("inline-flex h-9 items-center gap-1.5 rounded-full px-4 font-semibold ring-1 transition", voted ? "bg-brand-50 text-brand-700 ring-brand-300" : "text-ink ring-line-strong hover:bg-canvas")}
      >
        <ThumbUpIcon size={16} /> Helpful
      </button>
      {!reported ? (
        <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-ink-muted hover:text-ink">
          <FlagIcon size={15} /> Report
        </button>
      ) : <span className="text-ink-muted">Reported — thank you.</span>}
      {msg && <span role="status" className="w-full text-xs text-ink-muted sm:w-auto">{msg}</span>}
      {reporting && !reported && (
        <form
          className="w-full rounded-xl bg-canvas p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
            start(async () => {
              const r = await reportReviewAction(reviewId, reason);
              if (r.needsLogin) return login();
              if (!r.ok) return setMsg(r.error ?? "Something went wrong.");
              setReported(true); setReporting(false); setMsg(null);
            });
          }}
        >
          <fieldset>
            <legend className="text-sm font-semibold">Why are you reporting this review?</legend>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {Object.entries(REPORT_REASONS).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" value={k} required className="accent-brand-600" />{label}</label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={pending} className="h-9 rounded-full bg-ink px-4 text-sm font-semibold text-white">Send report</button>
            <button type="button" onClick={() => setReporting(false)} className="h-9 rounded-full px-4 text-sm font-semibold text-ink-muted ring-1 ring-line-strong">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Shown instantly while an admin page loads, so every click gets immediate feedback. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-line" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-line" />)}
      </div>
      <div className="card space-y-3 p-5">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-canvas" style={{ width: `${90 - i * 9}%` }} />)}
      </div>
    </div>
  );
}

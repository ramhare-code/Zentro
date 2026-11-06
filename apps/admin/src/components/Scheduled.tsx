import { PHASE_NAMES } from "@/lib/nav";

/** Honest placeholder for a section scheduled in a later build phase. */
export function Scheduled({ title, phase, items }: { title: string; phase: number; items: string[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="card mt-6 max-w-2xl p-6">
        <p className="text-sm font-semibold text-brand-700">Build phase {phase} · {PHASE_NAMES[phase]}</p>
        <p className="mt-2 text-ink-muted">This section is not available yet. It will include:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </div>
    </div>
  );
}

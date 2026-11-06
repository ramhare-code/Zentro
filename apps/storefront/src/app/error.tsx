"use client";

import { Button } from "@/components/ui/Button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
      <div>
        <h1 className="font-display text-3xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-ink-muted">Please try again. If the problem continues, contact support.</p>
        <Button className="mt-6" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}

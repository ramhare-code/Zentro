import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 font-display text-3xl font-bold">We couldn’t find that page</h1>
        <p className="mt-2 text-ink-muted">It may have moved, or the product is no longer available.</p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/">Go home</ButtonLink>
          <ButtonLink href="/categories" variant="secondary">Browse categories</ButtonLink>
        </div>
      </div>
    </div>
  );
}

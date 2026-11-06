import { ButtonLink } from "./ui/Button";

/** Honest placeholder for features scheduled in a later build phase. */
export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-ink-muted">{text}</p>
        <ButtonLink href="/" className="mt-6">Continue shopping</ButtonLink>
      </div>
    </div>
  );
}

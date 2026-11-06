import Link from "next/link";
export const metadata = { title: "Not permitted" };
export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold">You don’t have access to this page</h1>
      <p className="mt-2 text-sm text-ink-muted">Your role doesn’t include {need ? <code className="rounded bg-canvas px-1.5 py-0.5">{need}</code> : "this permission"}. Ask an Owner if you need it.</p>
      <Link href="/dashboard" className="btn btn-primary mt-6">Back to dashboard</Link>
    </div>
  );
}

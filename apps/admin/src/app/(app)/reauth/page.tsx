import { ReauthForm } from "@/components/auth/Forms";
import { requireStaff } from "@/lib/session";
export const metadata = { title: "Confirm it’s you" };
export default async function Reauth({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requireStaff();
  const { next } = await searchParams;
  return (
    <div className="card mx-auto mt-10 max-w-sm p-8">
      <h1 className="text-xl font-bold">Confirm it’s you</h1>
      <p className="mb-5 mt-1 text-sm text-ink-muted">Sensitive changes need a fresh code. You won’t be asked again for 10 minutes.</p>
      <ReauthForm next={next ?? "/dashboard"} />
    </div>
  );
}

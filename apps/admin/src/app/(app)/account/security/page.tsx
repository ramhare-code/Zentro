import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { revokeOwnSessionAction } from "@/lib/actions/admin";
import { db } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { requireStaff, SESSION_IDLE_MINUTES, SESSION_MAX_HOURS } from "@/lib/session";

export const metadata = { title: "Security & sessions" };

export default async function SecurityPage() {
  const s = await requireStaff();
  const sql = db();
  const [sessions, [codes]] = await Promise.all([
    sql<{ id: string; createdAt: Date; lastSeenAt: Date; ip: string | null; userAgent: string | null }[]>`
      select id, created_at as "createdAt", last_seen_at as "lastSeenAt", host(ip) as ip, user_agent as "userAgent"
      from shop.staff_sessions
      where staff_id = ${s.staffId} and revoked_at is null and expires_at > now()
        and last_seen_at > now() - make_interval(mins => ${SESSION_IDLE_MINUTES})
      order by last_seen_at desc`,
    sql<{ left: number }[]>`select count(*)::int as left from shop.staff_recovery_codes where staff_id = ${s.staffId} and used_at is null`,
  ]);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Security & sessions</h1>
      <section className="card p-5">
        <h2 className="font-semibold">Two-step verification</h2>
        <p className="mt-1 text-sm text-ink-muted">On. {codes?.left ?? 0} of 10 recovery codes unused.{(codes?.left ?? 0) < 3 && " Ask an Owner to reset your access to get new codes."}</p>
        <p className="mt-3 text-sm text-ink-muted">Sessions end after {SESSION_IDLE_MINUTES} minutes of inactivity and always after {SESSION_MAX_HOURS} hours.</p>
      </section>
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Active sessions</h2>
          {sessions.length > 1 && (
            <ActionForm action={revokeOwnSessionAction}><input type="hidden" name="sessionId" value="others" /><SubmitButton variant="secondary">Sign out other sessions</SubmitButton></ActionForm>
          )}
        </div>
        <ul className="mt-4 divide-y divide-line">
          {sessions.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{x.userAgent ?? "Unknown device"}</p>
                <p className="text-xs text-ink-muted">{x.ip ?? "unknown IP"} · signed in {formatDateTime(x.createdAt)} · active {timeAgo(x.lastSeenAt)}</p>
              </div>
              {x.id === s.sessionId ? <span className="text-xs font-semibold text-good-700">This device</span> : (
                <ActionForm action={revokeOwnSessionAction}><input type="hidden" name="sessionId" value={x.id} /><SubmitButton variant="secondary" className="h-9">Sign out</SubmitButton></ActionForm>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

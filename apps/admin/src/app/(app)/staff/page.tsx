import clsx from "clsx";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { inviteStaffAction, updateStaffAction } from "@/lib/actions/admin";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const me = await requirePermission("staff.manage");
  const sql = db();
  const [staff, roles] = await Promise.all([
    sql<{ id: string; email: string; fullName: string; status: string; roleId: string; roleName: string; lastLoginAt: Date | null; mfa: boolean; sessions: number; locked: boolean }[]>`
      select u.id, u.email, u.full_name as "fullName", u.status, u.role_id as "roleId", r.name as "roleName",
             u.last_login_at as "lastLoginAt", (u.totp_enabled_at is not null) as mfa,
             (u.locked_until is not null and u.locked_until > now()) as locked,
             (select count(*)::int from shop.staff_sessions s where s.staff_id = u.id and s.revoked_at is null and s.expires_at > now()) as sessions
      from shop.staff_users u join shop.admin_roles r on r.id = u.role_id
      order by u.status = 'disabled', u.full_name`,
    sql<{ id: string; name: string }[]>`select id, name from shop.admin_roles order by is_system desc, name`,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-ink-muted">Invite people, set their role, and remove access. Every change is recorded in the audit log.</p>
      </div>

      <section className="card p-5" aria-labelledby="invite">
        <h2 id="invite" className="font-semibold">Invite a staff member</h2>
        <ActionForm action={inviteStaffAction} className="mt-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_14rem_auto] md:items-end">
            <label className="text-sm font-medium">Full name<input name="fullName" required minLength={2} maxLength={100} className="input mt-1.5" /></label>
            <label className="text-sm font-medium">Work email<input name="email" type="email" required maxLength={200} className="input mt-1.5" /></label>
            <label className="text-sm font-medium">Role
              <select name="roleId" required className="input mt-1.5">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            </label>
            <SubmitButton className="h-11">Create invitation</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className="card overflow-x-auto" aria-label="Staff members">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr><th className="px-5 py-3">Name</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last sign-in</th><th className="px-3 py-3">Sessions</th><th className="px-5 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-5 py-3.5">
                  <p className="font-semibold">{u.fullName}{u.id === me.staffId && <span className="ml-2 text-xs font-normal text-ink-muted">(you)</span>}</p>
                  <p className="text-ink-muted">{u.email}</p>
                </td>
                <td className="px-3 py-3.5">
                  <ActionForm action={updateStaffAction} className="flex gap-2">
                    <input type="hidden" name="staffId" value={u.id} /><input type="hidden" name="op" value="change_role" />
                    <select name="roleId" defaultValue={u.roleId} aria-label={`Role for ${u.fullName}`} className="input h-9 w-40 text-sm">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                    <SubmitButton variant="secondary" className="h-9">Save</SubmitButton>
                  </ActionForm>
                </td>
                <td className="px-3 py-3.5">
                  <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                    u.status === "active" ? "bg-good-50 text-good-700" : u.status === "invited" ? "bg-info-50 text-info-700" : "bg-bad-50 text-bad-700")}>
                    {u.status === "active" ? "Active" : u.status === "invited" ? "Invited" : "Disabled"}
                  </span>
                  {u.locked && <span className="ml-1 inline-flex rounded-full bg-warn-50 px-2 py-0.5 text-xs font-semibold text-warn-700">Locked</span>}
                  {u.status === "active" && <p className="mt-1 text-xs text-ink-muted">{u.mfa ? "2-step on" : "2-step missing"}</p>}
                </td>
                <td className="px-3 py-3.5 text-ink-muted">{formatDateTime(u.lastLoginAt)}</td>
                <td className="px-3 py-3.5">{u.sessions}</td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap justify-end gap-2">
                    {u.sessions > 0 && (
                      <ActionForm action={updateStaffAction}><input type="hidden" name="staffId" value={u.id} /><input type="hidden" name="op" value="revoke_sessions" />
                        <SubmitButton variant="secondary" className="h-9">Sign out</SubmitButton></ActionForm>
                    )}
                    {u.id !== me.staffId && (
                      <ActionForm action={updateStaffAction}><input type="hidden" name="staffId" value={u.id} /><input type="hidden" name="op" value="reset_access" />
                        <SubmitButton variant="secondary" className="h-9" confirm={`Reset ${u.fullName}'s password and 2-step verification? They will need a new setup link.`}>Reset access</SubmitButton></ActionForm>
                    )}
                    {u.id !== me.staffId && (u.status === "disabled" ? (
                      <ActionForm action={updateStaffAction}><input type="hidden" name="staffId" value={u.id} /><input type="hidden" name="op" value="enable" />
                        <SubmitButton variant="secondary" className="h-9">Enable</SubmitButton></ActionForm>
                    ) : (
                      <ActionForm action={updateStaffAction}><input type="hidden" name="staffId" value={u.id} /><input type="hidden" name="op" value="disable" />
                        <SubmitButton variant="danger" className="h-9" confirm={`Disable ${u.fullName}? They will be signed out immediately.`}>Disable</SubmitButton></ActionForm>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { deleteRoleAction, saveRoleAction } from "@/lib/actions/admin";
import { db } from "@/lib/db";
import { OWNER_ONLY, PERMISSION_GROUPS } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Roles" };

type Role = { id: string; key: string; name: string; description: string | null; permissions: string[]; isSystem: boolean; users: number };

function PermissionGrid({ selected, disabled }: { selected: string[]; disabled: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {PERMISSION_GROUPS.map((g) => (
        <fieldset key={g.group} disabled={disabled}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.group}</legend>
          <ul className="space-y-1.5">
            {g.items.map(([key, label]) => {
              const ownerOnly = (OWNER_ONLY as readonly string[]).includes(key);
              return (
                <li key={key}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="permissions" value={key} defaultChecked={selected.includes(key)} disabled={ownerOnly && !disabled} className="mt-0.5 size-4 accent-brand-600" />
                    <span>{label}{ownerOnly && <span className="ml-1 text-xs text-ink-subtle">(Owner only)</span>}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const roles = await db()<Role[]>`
    select r.id, r.key, r.name, r.description, r.permissions, r.is_system as "isSystem",
           (select count(*)::int from shop.staff_users u where u.role_id = r.id and u.status <> 'disabled') as users
    from shop.admin_roles r order by r.is_system desc, r.name`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Roles & permissions</h1>
        <p className="mt-1 text-sm text-ink-muted">Built-in roles are fixed. Create custom roles for anything else. Permissions are enforced on the server for every page and action.</p>
      </div>

      {roles.map((r) => (
        <details key={r.id} className="card group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <span>
              <span className="font-semibold">{r.name}</span>
              {r.isSystem && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">Built-in</span>}
              <span className="mt-0.5 block text-sm text-ink-muted">{r.description}</span>
            </span>
            <span className="shrink-0 text-sm text-ink-muted">{r.users} staff · {r.permissions.length} permissions</span>
          </summary>
          <ActionForm action={saveRoleAction} className="mt-5 border-t border-line pt-5">
            <input type="hidden" name="roleId" value={r.id} />
            {!r.isSystem && (
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Name<input name="name" defaultValue={r.name} required className="input mt-1.5" /></label>
                <label className="text-sm font-medium">Description<input name="description" defaultValue={r.description ?? ""} className="input mt-1.5" /></label>
              </div>
            )}
            <PermissionGrid selected={r.permissions} disabled={r.isSystem} />
            {!r.isSystem && <div className="mt-5"><SubmitButton>Save role</SubmitButton></div>}
          </ActionForm>
          {!r.isSystem && (
            <ActionForm action={deleteRoleAction} className="mt-3">
              <input type="hidden" name="roleId" value={r.id} />
              <SubmitButton variant="danger" confirm={`Delete the ${r.name} role?`}>Delete role</SubmitButton>
            </ActionForm>
          )}
        </details>
      ))}

      <section className="card p-5" aria-labelledby="new-role">
        <h2 id="new-role" className="font-semibold">Create a custom role</h2>
        <ActionForm action={saveRoleAction} className="mt-4">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Name<input name="name" required minLength={2} maxLength={60} className="input mt-1.5" /></label>
            <label className="text-sm font-medium">Description<input name="description" maxLength={300} className="input mt-1.5" /></label>
          </div>
          <PermissionGrid selected={["dashboard.view"]} disabled={false} />
          <div className="mt-5"><SubmitButton>Create role</SubmitButton></div>
        </ActionForm>
      </section>
    </div>
  );
}

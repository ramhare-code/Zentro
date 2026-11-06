"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "../audit";
import { randomToken, sha256 } from "../crypto";
import { db } from "../db";
import { adminEnv } from "../env";
import type { TransactionSql } from "@zentro/commerce/db";
import { OWNER_ONLY, isPermission } from "../permissions";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const uuid = z.string().uuid();

// ----------------------------------------------------------------- staff

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  fullName: z.string().trim().min(2).max(100),
  roleId: uuid,
});

async function issueInvite(staffId: string, createdBy: string, tx: TransactionSql) {
  const token = randomToken(32);
  await tx`update shop.staff_invites set used_at = now() where staff_id = ${staffId} and used_at is null`;
  await tx`insert into shop.staff_invites (staff_id, token_hash, expires_at, created_by)
           values (${staffId}, ${sha256(token)}, now() + interval '72 hours', ${createdBy})`;
  return `${adminEnv().ADMIN_URL.replace(/\/$/, "")}/invite/${token}`;
}

export async function inviteStaffAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("staff.manage", { recentAuth: true });
    const parsed = inviteSchema.safeParse({ email: form.get("email"), fullName: form.get("fullName"), roleId: form.get("roleId") });
    if (!parsed.success) throw new UserError("Enter a valid name, email and role.");
    const { email, fullName, roleId } = parsed.data;
    const link = await db().begin(async (tx) => {
      const [role] = await tx<{ key: string }[]>`select key from shop.admin_roles where id = ${roleId}`;
      if (!role) throw new UserError("That role no longer exists.");
      const [existing] = await tx`select 1 from shop.staff_users where email = ${email}`;
      if (existing) throw new UserError("A staff account with that email already exists.");
      const [u] = await tx<{ id: string }[]>`
        insert into shop.staff_users (email, full_name, role_id, created_by) values (${email}, ${fullName}, ${roleId}, ${s.staffId}) returning id`;
      const url = await issueInvite(u!.id, s.staffId, tx);
      await audit(s, { action: "staff.invite", entityType: "staff", entityId: u!.id, details: { email, role: role.key } }, tx);
      return url;
    });
    revalidatePath("/staff");
    return { ok: true, message: `Invitation created for ${email}. Send this one-time link to them privately — it expires in 72 hours.`, secret: link };
  });
}

/** Prevents removing the last active owner. */
async function assertOwnerRemains(tx: TransactionSql, excludingStaffId: string) {
  const [r] = await tx<{ n: number }[]>`
    select count(*)::int as n from shop.staff_users u join shop.admin_roles r on r.id = u.role_id
    where r.key = 'owner' and u.status = 'active' and u.id <> ${excludingStaffId}`;
  if (!r || r.n < 1) throw new UserError("There must always be at least one active Owner.");
}

export async function updateStaffAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("staff.manage", { recentAuth: true });
    const staffId = uuid.parse(form.get("staffId"));
    const op = z.enum(["change_role", "disable", "enable", "revoke_sessions", "reset_access"]).parse(form.get("op"));
    let message = "Saved.";
    let secret: string | undefined;
    await db().begin(async (tx) => {
      const [target] = await tx<{ email: string; status: string; roleKey: string }[]>`
        select u.email, u.status, r.key as "roleKey" from shop.staff_users u join shop.admin_roles r on r.id = u.role_id
        where u.id = ${staffId} for update of u`;
      if (!target) throw new UserError("Staff member not found.");
      const self = staffId === s.staffId;

      if (op === "change_role") {
        const roleId = uuid.parse(form.get("roleId"));
        const [role] = await tx<{ key: string }[]>`select key from shop.admin_roles where id = ${roleId}`;
        if (!role) throw new UserError("Role not found.");
        if (target.roleKey === "owner" && role.key !== "owner") await assertOwnerRemains(tx, staffId);
        await tx`update shop.staff_users set role_id = ${roleId} where id = ${staffId}`;
        // permissions change takes effect immediately; force a fresh sign-in
        await tx`update shop.staff_sessions set revoked_at = now(), revoked_reason = 'role_changed' where staff_id = ${staffId} and revoked_at is null and ${!self}`;
        await audit(s, { action: "staff.role_change", entityType: "staff", entityId: staffId, details: { email: target.email, from: target.roleKey, to: role.key } }, tx);
        message = `Role changed to ${role.key}.`;
      } else if (op === "disable") {
        if (self) throw new UserError("You can’t disable your own account.");
        if (target.roleKey === "owner") await assertOwnerRemains(tx, staffId);
        await tx`update shop.staff_users set status = 'disabled' where id = ${staffId}`;
        await tx`update shop.staff_sessions set revoked_at = now(), revoked_reason = 'disabled' where staff_id = ${staffId} and revoked_at is null`;
        await audit(s, { action: "staff.disable", entityType: "staff", entityId: staffId, details: { email: target.email } }, tx);
        message = "Account disabled and signed out everywhere.";
      } else if (op === "enable") {
        const [u] = await tx<{ ready: boolean }[]>`select (password_hash is not null and totp_enabled_at is not null) as ready from shop.staff_users where id = ${staffId}`;
        if (!u?.ready) throw new UserError("This account hasn’t finished setup. Use “Reset access” to send a new invitation.");
        await tx`update shop.staff_users set status = 'active', failed_logins = 0, locked_until = null where id = ${staffId}`;
        await audit(s, { action: "staff.enable", entityType: "staff", entityId: staffId, details: { email: target.email } }, tx);
        message = "Account re-enabled.";
      } else if (op === "revoke_sessions") {
        const r = await tx`update shop.staff_sessions set revoked_at = now(), revoked_reason = 'revoked_by_admin'
                           where staff_id = ${staffId} and revoked_at is null and (${!self} or id <> ${s.sessionId})`;
        await audit(s, { action: "staff.sessions_revoke", entityType: "staff", entityId: staffId, details: { email: target.email, count: r.count } }, tx);
        message = `${r.count} session(s) signed out.`;
      } else if (op === "reset_access") {
        if (self) throw new UserError("Use Security & sessions to manage your own sign-in.");
        if (target.roleKey === "owner") await assertOwnerRemains(tx, staffId);
        await tx`update shop.staff_users set status = 'invited', password_hash = null, totp_secret_enc = null,
                 totp_enabled_at = null, totp_last_step = null, failed_logins = 0, locked_until = null where id = ${staffId}`;
        await tx`delete from shop.staff_recovery_codes where staff_id = ${staffId}`;
        await tx`update shop.staff_sessions set revoked_at = now(), revoked_reason = 'access_reset' where staff_id = ${staffId} and revoked_at is null`;
        secret = await issueInvite(staffId, s.staffId, tx);
        await audit(s, { action: "staff.access_reset", entityType: "staff", entityId: staffId, details: { email: target.email } }, tx);
        message = "Password and two-step verification reset. Send this new one-time setup link privately.";
      }
    });
    revalidatePath("/staff");
    return { ok: true, message, secret };
  });
}

// ----------------------------------------------------------------- roles

const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
});

export async function saveRoleAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("roles.manage", { recentAuth: true });
    const parsed = roleSchema.safeParse({ name: form.get("name"), description: form.get("description") || undefined });
    if (!parsed.success) throw new UserError("Give the role a name (2–60 characters).");
    const requested = form.getAll("permissions").map(String);
    const invalid = requested.filter((p) => !isPermission(p));
    if (invalid.length) throw new UserError("Unknown permission submitted.");
    if (requested.some((p) => (OWNER_ONLY as readonly string[]).includes(p))) {
      throw new UserError("Staff, role and settings management are reserved for the Owner role.");
    }
    const permissions = [...new Set(requested)].sort();
    const roleId = form.get("roleId") ? uuid.parse(form.get("roleId")) : null;
    await db().begin(async (tx) => {
      if (roleId) {
        const [r] = await tx<{ isSystem: boolean; permissions: string[] }[]>`select is_system as "isSystem", permissions from shop.admin_roles where id = ${roleId} for update`;
        if (!r) throw new UserError("Role not found.");
        if (r.isSystem) throw new UserError("Built-in roles can’t be edited. Create a custom role instead.");
        await tx`update shop.admin_roles set name = ${parsed.data.name}, description = ${parsed.data.description ?? null}, permissions = ${permissions} where id = ${roleId}`;
        await audit(s, { action: "role.update", entityType: "role", entityId: roleId, details: { name: parsed.data.name, added: permissions.filter((p) => !r.permissions.includes(p)), removed: r.permissions.filter((p) => !permissions.includes(p)) } }, tx);
      } else {
        const key = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "role";
        const [dupe] = await tx`select 1 from shop.admin_roles where key = ${key} or lower(name) = lower(${parsed.data.name})`;
        if (dupe) throw new UserError("A role with that name already exists.");
        const [r] = await tx<{ id: string }[]>`insert into shop.admin_roles (key, name, description, permissions) values (${/^[a-z]/.test(key) ? key : `r_${key}`}, ${parsed.data.name}, ${parsed.data.description ?? null}, ${permissions}) returning id`;
        await audit(s, { action: "role.create", entityType: "role", entityId: r!.id, details: { name: parsed.data.name, permissions } }, tx);
      }
    });
    revalidatePath("/roles");
    return { ok: true, message: "Role saved. Changes apply on each staff member’s next request." };
  });
}

export async function deleteRoleAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("roles.manage", { recentAuth: true });
    const roleId = uuid.parse(form.get("roleId"));
    await db().begin(async (tx) => {
      const [r] = await tx<{ isSystem: boolean; name: string; users: number }[]>`
        select is_system as "isSystem", name, (select count(*)::int from shop.staff_users where role_id = ${roleId}) as users
        from shop.admin_roles where id = ${roleId} for update`;
      if (!r) throw new UserError("Role not found.");
      if (r.isSystem) throw new UserError("Built-in roles can’t be deleted.");
      if (r.users > 0) throw new UserError(`${r.users} staff member(s) still have this role. Move them to another role first.`);
      await tx`delete from shop.admin_roles where id = ${roleId}`;
      await audit(s, { action: "role.delete", entityType: "role", entityId: roleId, details: { name: r.name } }, tx);
    });
    revalidatePath("/roles");
    return { ok: true, message: "Role deleted." };
  });
}

// ----------------------------------------------------------------- own sessions

export async function revokeOwnSessionAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("dashboard.view");
    const target = form.get("sessionId") === "others" ? "others" : uuid.parse(form.get("sessionId"));
    const r = target === "others"
      ? await db()`update shop.staff_sessions set revoked_at = now(), revoked_reason = 'revoked_by_user' where staff_id = ${s.staffId} and id <> ${s.sessionId} and revoked_at is null`
      : await db()`update shop.staff_sessions set revoked_at = now(), revoked_reason = 'revoked_by_user' where staff_id = ${s.staffId} and id = ${target} and revoked_at is null`;
    await audit(s, { action: "auth.session_revoke", details: { target, count: r.count } });
    revalidatePath("/account/security");
    return { ok: true, message: `${r.count} session(s) signed out.` };
  });
}

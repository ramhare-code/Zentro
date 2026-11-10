import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomToken, sha256 } from "./crypto";
import { db } from "./db";
import { adminEnv } from "./env";
import { isPermission, type Permission } from "./permissions";
import { requestMeta } from "./request";

export const SESSION_IDLE_MINUTES = 30;
export const SESSION_MAX_HOURS = 12;
export const REAUTH_MINUTES = 10;
/** "Remember this device": stays signed in for this many days without asking again. */
export const REMEMBER_DAYS = 30;

export function sessionCookieName() {
  return adminEnv().ADMIN_URL.startsWith("https://") ? "__Host-zentro_admin" : "zentro_admin";
}

export interface StaffSession {
  sessionId: string;
  staffId: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleName: string;
  permissions: Set<Permission>;
  reauthAt: Date;
}

export async function createSession(staffId: string, remember = false): Promise<void> {
  const token = randomToken(32);
  const { ip, userAgent } = await requestMeta();
  const hours = remember ? REMEMBER_DAYS * 24 : SESSION_MAX_HOURS;
  await db()`
    insert into shop.staff_sessions (staff_id, token_hash, expires_at, ip, user_agent, remember)
    values (${staffId}, ${sha256(token)}, now() + make_interval(hours => ${hours}), ${ip}, ${userAgent}, ${remember})`;
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: adminEnv().ADMIN_URL.startsWith("https://"),
    // lax: opening the admin from a link (email, chat app) keeps you signed in;
    // server actions are still protected by Next.js's same-origin check
    sameSite: "lax",
    path: "/",
    maxAge: hours * 3600,
  });
}

/** Current session, validated against the database on every request. */
export const getSession = cache(async (): Promise<StaffSession | null> => {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token || token.length > 100) return null;
  const sql = db();
  const [row] = await sql<
    { sessionId: string; staffId: string; email: string; fullName: string; roleKey: string; roleName: string; permissions: string[]; reauthAt: Date; lastSeenAt: Date }[]
  >`
    select s.id as "sessionId", u.id as "staffId", u.email, u.full_name as "fullName",
           r.key as "roleKey", r.name as "roleName", r.permissions, s.reauth_at as "reauthAt", s.last_seen_at as "lastSeenAt"
    from shop.staff_sessions s
    join shop.staff_users u on u.id = s.staff_id
    join shop.admin_roles r on r.id = u.role_id
    where s.token_hash = ${sha256(token)}
      and s.revoked_at is null
      and s.expires_at > now()
      and (s.remember or s.last_seen_at > now() - make_interval(mins => ${SESSION_IDLE_MINUTES}))
      and u.status = 'active'`;
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 60_000) {
    await sql`update shop.staff_sessions set last_seen_at = now() where id = ${row.sessionId}`;
  }
  return {
    sessionId: row.sessionId,
    staffId: row.staffId,
    email: row.email,
    fullName: row.fullName,
    roleKey: row.roleKey,
    roleName: row.roleName,
    permissions: new Set(row.permissions.filter(isPermission)),
    reauthAt: row.reauthAt,
  };
});

export async function destroySession(reason: string) {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    await db()`update shop.staff_sessions set revoked_at = now(), revoked_reason = ${reason}
               where token_hash = ${sha256(token)} and revoked_at is null`;
  }
  jar.delete(sessionCookieName());
}

export class AuthorizationError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing permission: ${permission}`);
  }
}

/** For pages: redirects to login when signed out; renders 403 view when not permitted. */
export async function requireStaff(): Promise<StaffSession> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requirePermission(p: Permission): Promise<StaffSession> {
  const s = await requireStaff();
  if (!s.permissions.has(p)) redirect(`/forbidden?need=${encodeURIComponent(p)}`);
  return s;
}

/**
 * For server actions and API routes: throws instead of redirecting so the
 * mutation is never executed. Optionally requires a recent MFA proof.
 */
export async function authorize(p: Permission, opts: { recentAuth?: boolean } = {}): Promise<StaffSession> {
  const s = await getSession();
  if (!s) throw new AuthorizationError("authenticated");
  if (!s.permissions.has(p)) throw new AuthorizationError(p);
  if (opts.recentAuth && Date.now() - s.reauthAt.getTime() > REAUTH_MINUTES * 60_000) {
    throw new AuthorizationError("recent_auth");
  }
  return s;
}

export function can(s: StaffSession, p: Permission) {
  return s.permissions.has(p);
}

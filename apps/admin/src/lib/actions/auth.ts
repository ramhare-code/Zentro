"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "../audit";
import { DUMMY_PASSWORD_HASH, encrypt, hashPassword, randomToken, sha256, verifyPassword } from "../crypto";
import { db } from "../db";
import { adminEnv } from "../env";
import { generateRecoveryCodes, normaliseRecovery, verifySecondFactor } from "../mfa";
import { rateLimit } from "../rate-limit";
import { requestMeta } from "../request";
import { createSession, destroySession, getSession } from "../session";
import { generateTotpSecret, verifyTotp } from "../totp";
import { decrypt } from "../crypto";
import { loadInvite } from "../invite";

export type FormState = { error?: string; ok?: boolean; email?: string } | undefined;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const CHALLENGE_COOKIE = "zentro_admin_mfa";
const RECOVERY_COOKIE = "zentro_admin_rc";
const GENERIC_LOGIN_ERROR = "Email or password is incorrect, or the account is locked.";
const MIN_PASSWORD = 8;

/** Password rules shared by set-up and change. Letters from any language count (by character, not byte). */
function passwordProblem(password: string, confirm: string, email: string): string | null {
  const n = [...password].length;
  if (n < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters. Letters in any language, numbers and symbols all count.`;
  if (n > 128) return "Use at most 128 characters.";
  if (password !== confirm) return "The two passwords do not match.";
  const local = email.split("@")[0] ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local.toLowerCase())) return "Don’t include your email address in your password.";
  if (/^(.)\1+$/u.test(password) || /^(?:0123456789|12345678|password|qwerty)/i.test(password)) return "That password is too easy to guess.";
  return null;
}

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/dashboard";
}

// ---------------------------------------------------------------- login

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const { ip } = await requestMeta();

  if (!(await rateLimit(`admin-login:ip:${ip ?? "unknown"}`, 30, 900)) || !(await rateLimit(`admin-login:email:${email}`, 10, 900))) {
    return { error: "Too many sign-in attempts. Please wait 15 minutes and try again.", email };
  }

  const sql = db();
  const [u] = await sql<{ id: string; email: string; passwordHash: string | null; status: string; lockedUntil: Date | null }[]>`
    select id, email, password_hash as "passwordHash", status, locked_until as "lockedUntil"
    from shop.staff_users where email = ${email}`;

  // always run scrypt so timing does not reveal whether the account exists
  const passwordOk = await verifyPassword(password, u?.passwordHash ?? DUMMY_PASSWORD_HASH);
  const locked = !!u?.lockedUntil && u.lockedUntil > new Date();

  if (!u || !passwordOk || u.status !== "active" || locked) {
    if (u && !passwordOk && !locked) {
      await sql`
        update shop.staff_users
           set failed_logins = failed_logins + 1,
               locked_until = case when failed_logins + 1 >= ${MAX_FAILED_LOGINS}
                                   then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end
         where id = ${u.id}`;
    }
    await audit(u ? { staffId: u.id, email: u.email } : null, {
      action: "auth.login_failed",
      details: { email, reason: !u ? "unknown_email" : locked ? "locked" : u.status !== "active" ? `status_${u.status}` : "bad_password" },
    });
    return { error: GENERIC_LOGIN_ERROR, email };
  }

  await sql`update shop.staff_users set failed_logins = 0, locked_until = null where id = ${u.id}`;
  const challenge = randomToken(32);
  await sql`delete from shop.staff_login_challenges where staff_id = ${u.id} or expires_at < now()`;
  await sql`insert into shop.staff_login_challenges (token_hash, staff_id, ip, expires_at)
            values (${sha256(challenge)}, ${u.id}, ${ip}, now() + interval '5 minutes')`;
  (await cookies()).set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true, sameSite: "strict", path: "/login", maxAge: 300, secure: adminEnv().ADMIN_URL.startsWith("https://"),
  });
  redirect(`/login/mfa?next=${encodeURIComponent(safeNext(form.get("next")))}`);
}

export async function mfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const challenge = jar.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) return { error: "Your sign-in has expired. Please start again." };
  const sql = db();
  const [c] = await sql<{ staffId: string; email: string; attempts: number }[]>`
    select c.staff_id as "staffId", u.email, c.attempts
    from shop.staff_login_challenges c join shop.staff_users u on u.id = c.staff_id
    where c.token_hash = ${sha256(challenge)} and c.expires_at > now() and u.status = 'active'`;
  if (!c || c.attempts >= 5) {
    jar.delete(CHALLENGE_COOKIE);
    return { error: "Your sign-in has expired or had too many attempts. Please start again." };
  }

  const method = await verifySecondFactor(c.staffId, String(form.get("code") ?? "").slice(0, 20));
  if (!method) {
    await sql`update shop.staff_login_challenges set attempts = attempts + 1 where token_hash = ${sha256(challenge)}`;
    await audit({ staffId: c.staffId, email: c.email }, { action: "auth.mfa_failed" });
    return { error: "That code is not valid. Check your authenticator app and try again." };
  }

  await sql`delete from shop.staff_login_challenges where staff_id = ${c.staffId}`;
  await sql`update shop.staff_users set last_login_at = now() where id = ${c.staffId}`;
  jar.delete(CHALLENGE_COOKIE);
  await createSession(c.staffId, form.get("remember") === "on");
  await audit({ staffId: c.staffId, email: c.email }, { action: "auth.login", details: { method } });
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  const s = await getSession();
  await destroySession("signed_out");
  if (s) await audit(s, { action: "auth.logout" });
  redirect("/login");
}

/** Step-up verification before sensitive actions. */
export async function reauthAction(_prev: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await rateLimit(`admin-reauth:${s.staffId}`, 10, 900))) return { error: "Too many attempts. Try again later." };
  const method = await verifySecondFactor(s.staffId, String(form.get("code") ?? "").slice(0, 20));
  if (!method) {
    await audit(s, { action: "auth.reauth_failed" });
    return { error: "That code is not valid." };
  }
  await db()`update shop.staff_sessions set reauth_at = now() where id = ${s.sessionId}`;
  await audit(s, { action: "auth.reauth", details: { method } });
  redirect(safeNext(form.get("next")));
}

// ---------------------------------------------------------------- invites

export async function invitePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const invite = await loadInvite(token);
  if (!invite) return { error: "This invitation is invalid or has expired. Ask the store owner for a new one." };
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = passwordProblem(password, confirm, invite.email);
  if (problem) return { error: problem };

  const secret = generateTotpSecret();
  await db()`
    update shop.staff_users
       set password_hash = ${await hashPassword(password)}, password_changed_at = now(),
           totp_secret_enc = ${encrypt(secret, adminEnv().ADMIN_ENCRYPTION_KEY)}
     where id = ${invite.staffId} and status = 'invited'`;
  redirect(`/invite/${token}`);
}

export async function inviteMfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const invite = await loadInvite(token);
  if (!invite || !invite.hasPassword) return { error: "This invitation is invalid or has expired." };
  const secret = decrypt(invite.secretEnc!, adminEnv().ADMIN_ENCRYPTION_KEY);
  const step = verifyTotp(secret, String(form.get("code") ?? "").replace(/\s/g, ""), null);
  if (step === null) return { error: "That code didn’t match. Make sure your phone’s time is set automatically, then try the newest code." };

  const codes = generateRecoveryCodes();
  await db().begin(async (tx) => {
    await tx`update shop.staff_users set totp_enabled_at = now(), totp_last_step = ${step}, status = 'active', last_login_at = now()
             where id = ${invite.staffId} and status = 'invited'`;
    await tx`update shop.staff_invites set used_at = now() where id = ${invite.inviteId}`;
    await tx`delete from shop.staff_recovery_codes where staff_id = ${invite.staffId}`;
    for (const c of codes) {
      await tx`insert into shop.staff_recovery_codes (staff_id, code_hash) values (${invite.staffId}, ${sha256(normaliseRecovery(c))})`;
    }
    await audit({ staffId: invite.staffId, email: invite.email }, { action: "staff.invite_accepted", entityType: "staff", entityId: invite.staffId }, tx);
  });
  await createSession(invite.staffId);
  // Hand the codes to a one-time display page via a short-lived, encrypted,
  // httpOnly cookie scoped to that page only. Only hashes are stored in the DB.
  (await cookies()).set(RECOVERY_COOKIE, encrypt(JSON.stringify(codes), adminEnv().ADMIN_ENCRYPTION_KEY), {
    httpOnly: true, sameSite: "strict", path: "/account/recovery-codes", maxAge: 300, secure: adminEnv().ADMIN_URL.startsWith("https://"),
  });
  redirect("/account/recovery-codes");
}

// ---------------------------------------------------------------- change password

/** Signed-in staff change their own password; other devices are signed out. */
export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await rateLimit(`admin-pwchange:${s.staffId}`, 10, 900))) return { error: "Too many attempts. Try again later." };
  const current = String(form.get("current") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 600);
  const sql = db();
  const [u] = await sql<{ hash: string | null }[]>`select password_hash as hash from shop.staff_users where id = ${s.staffId}`;
  if (!u?.hash || !(await verifyPassword(current, u.hash))) {
    await audit(s, { action: "auth.password_change_failed" });
    return { error: "Your current password is not correct." };
  }
  const problem = passwordProblem(password, String(form.get("confirm") ?? "").slice(0, 600), s.email);
  if (problem) return { error: problem };
  await sql`update shop.staff_users set password_hash = ${await hashPassword(password)}, password_changed_at = now() where id = ${s.staffId}`;
  await sql`update shop.staff_sessions set revoked_at = now(), revoked_reason = 'password_changed'
            where staff_id = ${s.staffId} and id <> ${s.sessionId} and revoked_at is null`;
  await audit(s, { action: "auth.password_changed" });
  return { ok: true };
}

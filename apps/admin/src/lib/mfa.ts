import "server-only";
import { randomBytes } from "node:crypto";
import { decrypt, sha256 } from "./crypto";
import { db } from "./db";
import { adminEnv } from "./env";
import { base32Encode, verifyTotp } from "./totp";

export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const c = base32Encode(randomBytes(5)).slice(0, 8).toLowerCase();
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
}

export const normaliseRecovery = (code: string) => code.trim().toLowerCase().replace(/[^a-z2-7]/g, "");

/**
 * Checks a 6-digit TOTP code (with replay protection) or a single-use
 * recovery code for a staff member. Returns the method used, or null.
 */
export async function verifySecondFactor(staffId: string, input: string): Promise<"totp" | "recovery" | null> {
  const sql = db();
  const code = input.replace(/\s/g, "");
  if (/^\d{6}$/.test(code)) {
    const [u] = await sql<{ secret: string | null; lastStep: string | null }[]>`
      select totp_secret_enc as secret, totp_last_step::text as "lastStep" from shop.staff_users where id = ${staffId}`;
    if (!u?.secret) return null;
    const step = verifyTotp(decrypt(u.secret, adminEnv().ADMIN_ENCRYPTION_KEY), code, u.lastStep ? Number(u.lastStep) : null);
    if (step === null) return null;
    // conditional update makes concurrent replays of the same code fail
    const updated = await sql`
      update shop.staff_users set totp_last_step = ${step}
      where id = ${staffId} and (totp_last_step is null or totp_last_step < ${step})`;
    return updated.count === 1 ? "totp" : null;
  }
  const clean = normaliseRecovery(code);
  if (clean.length !== 8) return null;
  const used = await sql`
    update shop.staff_recovery_codes set used_at = now()
    where staff_id = ${staffId} and code_hash = ${sha256(clean)} and used_at is null`;
  return used.count === 1 ? "recovery" : null;
}

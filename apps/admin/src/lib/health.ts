import "server-only";
import { razorpayConfigFromEnv } from "@zentro/commerce/razorpay";
import { shiprocketConfigFromEnv } from "@zentro/commerce/shipping";
import { db } from "./db";

/** Admin-side configuration status — never secret values. */
export async function integrationChecks(): Promise<Record<string, string>> {
  const [r] = await db()<{ owners: number; mfaMissing: number; brokenAt: string | null }[]>`
    select (select count(*)::int from shop.staff_users u join shop.admin_roles r on r.id = u.role_id where r.key = 'owner' and u.status = 'active') as owners,
           (select count(*)::int from shop.staff_users where status = 'active' and totp_enabled_at is null) as "mfaMissing",
           shop.verify_audit_chain()::text as "brokenAt"`;
  return {
    payments: razorpayConfigFromEnv() ? "configured" : "not configured",
    courier: shiprocketConfigFromEnv() ? "configured" : "not configured",
    encryptionKey: process.env.ADMIN_ENCRYPTION_KEY ? "set" : "MISSING",
    storefrontLink: process.env.STOREFRONT_URL && process.env.REVALIDATE_SECRET ? "configured" : "incomplete (cache refresh off)",
    activeOwners: String(r?.owners ?? 0),
    staffWithoutMfa: String(r?.mfaMissing ?? 0),
    auditChain: r?.brokenAt ? `BROKEN at entry ${r.brokenAt}` : "intact",
  };
}

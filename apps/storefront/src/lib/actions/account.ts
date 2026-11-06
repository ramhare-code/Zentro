"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STATE_CODES } from "@zentro/commerce";
import { hasMarketingConsent, withdrawConsent, type Channel } from "@zentro/commerce/messaging";
import { syncCartCount, getCartId } from "../cart";
import {
  checkPhoneCode, clientIp, consumeToken, DUMMY_HASH, endSession, getCustomer, hashPassword, issueToken, passwordProblem,
  rateLimited, sendAccountMessage, sendVerificationEmail, startPhoneVerification, startSession, verifyPassword,
} from "../customer";
import { db } from "../db";
import { siteUrl } from "../site";

export type FormResult = { ok?: boolean; error?: string; message?: string } | undefined;

const s = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/account");

async function requireCustomer() {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  return c;
}

// ------------------------------------------------------------------ sign up / in / out

export async function registerAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const name = s(f, "fullName", 100);
  const email = s(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "");
  if (name.length < 2) return { error: "Enter your full name." };
  if (!z.string().email().safeParse(email).success) return { error: "Enter a valid email address." };
  const problem = passwordProblem(password, email);
  if (problem) return { error: problem };
  if (await rateLimited(`register:${await clientIp()}`, 5, 3600)) return { error: "Too many sign-ups from this network. Try again later." };

  const sql = db();
  const [exists] = await sql`select 1 from shop.customers where email = ${email} and status <> 'deleted'`;
  if (exists) return { error: "An account with this email already exists. Sign in or reset your password." };
  const [c] = await sql<{ id: string }[]>`
    insert into shop.customers (email, full_name, password_hash) values (${email}, ${name}, ${await hashPassword(password)}) returning id`;
  // link earlier guest orders placed with this email only after the email is verified (see verifyEmail)
  await startSession(c!.id);
  await sendVerificationEmail({ id: c!.id, email, fullName: name });
  redirect(safeNext(s(f, "next")) + (safeNext(s(f, "next")).includes("?") ? "&" : "?") + "welcome=1");
}

export async function loginAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const email = s(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "").slice(0, 200);
  const ip = await clientIp();
  if (await rateLimited(`login:ip:${ip}`, 30, 900) || await rateLimited(`login:email:${email}`, 10, 900)) {
    return { error: "Too many attempts. Please wait 15 minutes." };
  }
  const sql = db();
  const [c] = await sql<{ id: string; hash: string; status: string; lockedUntil: Date | null }[]>`
    select id, password_hash as hash, status, locked_until as "lockedUntil" from shop.customers where email = ${email} and status <> 'deleted'`;
  const ok = await verifyPassword(password, c?.hash ?? DUMMY_HASH);
  const locked = !!c?.lockedUntil && c.lockedUntil > new Date();
  if (!c || !ok || locked) {
    if (c && !ok) await sql`update shop.customers set failed_logins = failed_logins + 1,
                     locked_until = case when failed_logins + 1 >= 8 then now() + interval '15 minutes' else locked_until end where id = ${c.id}`;
    return { error: locked ? "Too many failed attempts. Try again in 15 minutes or reset your password." : "Email or password is incorrect." };
  }
  if (c.status === "restricted") return { error: "This account is restricted. Please contact support." };
  await startSession(c.id);
  await syncCartCount(await getCartId(false));
  redirect(safeNext(s(f, "next")));
}

export async function logoutAction() {
  await endSession();
  await syncCartCount(null);
  redirect("/");
}

// ------------------------------------------------------------------ verification & recovery

export async function verifyEmail(token: string): Promise<boolean> {
  const id = await consumeToken(token, "verify_email");
  if (!id) return false;
  await db().begin(async (tx) => {
    const [c] = await tx<{ email: string }[]>`update shop.customers set email_verified_at = coalesce(email_verified_at, now()) where id = ${id} returning email`;
    // now that the email is proven, attach this customer's earlier guest orders
    await tx`update shop.orders set user_id = ${id} where user_id is null and lower(email) = ${c!.email}`;
  });
  return true;
}

export async function resendVerificationAction(): Promise<FormResult> {
  const c = await requireCustomer();
  if (c.emailVerified) return { ok: true, message: "Your email is already verified." };
  if (await rateLimited(`verify-resend:${c.id}`, 3, 3600)) return { error: "Please wait before requesting another email." };
  const r = await sendVerificationEmail(c);
  return r.sent ? { ok: true, message: `Verification email sent to ${c.email}.` } : { error: "We couldn’t send the email right now. Please try again later." };
}

export async function forgotPasswordAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const email = s(f, "email").toLowerCase();
  const generic = { ok: true, message: "If an account exists for that email, we’ve sent a link to reset your password. It’s valid for 30 minutes." };
  if (await rateLimited(`forgot:${await clientIp()}`, 10, 3600) || await rateLimited(`forgot:${email}`, 3, 3600)) return generic;
  const [c] = await db()<{ id: string; fullName: string }[]>`select id, full_name as "fullName" from shop.customers where email = ${email} and status = 'active'`;
  if (c) {
    const token = await issueToken(c.id, "reset_password", 30);
    await sendAccountMessage("email", email, "password_reset", { name: c.fullName.split(" ")[0]!, actionLink: siteUrl(`/account/reset?token=${token}`) });
  }
  return generic; // same answer either way: never reveal whether an email is registered
}

export async function resetPasswordAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const token = s(f, "token", 100);
  const password = String(f.get("password") ?? "");
  const sql = db();
  const [t] = await sql<{ email: string }[]>`
    select c.email from shop.customer_tokens t join shop.customers c on c.id = t.customer_id
    where t.secret_hash = ${createHash("sha256").update(token).digest("hex")} and t.purpose = 'reset_password' and t.used_at is null and t.expires_at > now()`;
  if (!t) return { error: "This reset link has expired. Please request a new one." };
  const problem = passwordProblem(password, t.email);
  if (problem) return { error: problem };
  const id = await consumeToken(token, "reset_password");
  if (!id) return { error: "This reset link has expired. Please request a new one." };
  await sql`update shop.customers set password_hash = ${await hashPassword(password)}, failed_logins = 0, locked_until = null,
            email_verified_at = coalesce(email_verified_at, now()) where id = ${id}`;
  await sql`update shop.customer_sessions set revoked_at = now() where customer_id = ${id} and revoked_at is null`;
  await startSession(id);
  redirect("/account?reset=1");
}

export async function sendPhoneCodeAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const c = await requireCustomer();
  const phone = s(f, "phone", 20).replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) return { error: "Enter a valid 10-digit mobile number." };
  if (await rateLimited(`otp:${c.id}`, 3, 900) || await rateLimited(`otp:phone:${phone}`, 5, 3600)) return { error: "Too many codes requested. Please wait 15 minutes." };
  const r = await startPhoneVerification(c.id, phone);
  if (!r.sent) return { error: "We can’t send SMS codes yet — the SMS service isn’t set up. Please try again later." };
  return { ok: true, message: `We sent a 6-digit code to ••••••${phone.slice(-4)}. It expires in 10 minutes.` };
}

export async function verifyPhoneCodeAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const c = await requireCustomer();
  const r = await checkPhoneCode(c.id, s(f, "code", 10));
  if (r === "ok") { revalidatePath("/account"); return { ok: true, message: "Mobile number verified." }; }
  return { error: r === "expired" ? "That code has expired. Request a new one." : "That code isn’t right." };
}

// ------------------------------------------------------------------ profile & addresses

export async function updateProfileAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const c = await requireCustomer();
  const name = s(f, "fullName", 100);
  if (name.length < 2) return { error: "Enter your full name." };
  await db()`update shop.customers set full_name = ${name} where id = ${c.id}`;
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

const addressSchema = z.object({
  label: z.string().trim().max(30).optional(),
  fullName: z.string().trim().min(2, "Enter the recipient’s name.").max(100),
  phone: z.string().transform((v) => v.replace(/\D/g, "").slice(-10)).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number.")),
  line1: z.string().trim().min(3, "Enter the street address.").max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2, "Enter the city.").max(80),
  stateCode: z.string().refine((v) => STATE_CODES.includes(v), "Choose a state."),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode."),
});

export async function saveAddressAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const c = await requireCustomer();
  const parsed = addressSchema.safeParse(Object.fromEntries(["label", "fullName", "phone", "line1", "line2", "landmark", "city", "stateCode", "pincode"].map((k) => [k, s(f, k)])));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const a = parsed.data;
  const id = z.guid().safeParse(f.get("addressId")).data;
  const makeDefault = f.get("isDefault") === "on";
  const sql = db();
  const [cnt] = await sql<{ n: number }[]>`select count(*)::int as n from shop.addresses where user_id = ${c.id}`;
  const n = cnt?.n ?? 0;
  if (!id && n >= 10) return { error: "You can save up to 10 addresses." };
  await sql.begin(async (tx) => {
    if (makeDefault || n === 0) await tx`update shop.addresses set is_default = false where user_id = ${c.id}`;
    const row = { label: a.label || null, full_name: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 || null, landmark: a.landmark || null, city: a.city, state_code: a.stateCode, pincode: a.pincode };
    if (id) await tx`update shop.addresses set ${tx(row)}, is_default = (is_default or ${makeDefault}) where id = ${id} and user_id = ${c.id}`;
    else await tx`insert into shop.addresses ${tx({ ...row, user_id: c.id, is_default: makeDefault || n === 0 })}`;
  });
  revalidatePath("/account");
  return { ok: true, message: "Address saved." };
}

export async function deleteAddressAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const c = await requireCustomer();
  const id = z.guid().parse(f.get("addressId"));
  await db()`delete from shop.addresses where id = ${id} and user_id = ${c.id}`;
  revalidatePath("/account");
  return { ok: true, message: "Address removed." };
}

// ------------------------------------------------------------------ marketing preferences

const WORDING: Record<Channel, string> = {
  sms: "Send me offers and new arrivals by SMS.", whatsapp: "Send me offers and new arrivals on WhatsApp.", email: "Send me offers and new arrivals by email.",
};

/** Customers manage each channel independently. Opting in needs a verified email / mobile. */
export async function setPreferenceAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const c = await requireCustomer();
  const channel = z.enum(["sms", "whatsapp", "email"]).parse(f.get("channel")) as Channel;
  const on = f.get("on") === "1";
  const recipient = channel === "email" ? c.email : c.phone;
  if (!recipient) return { error: "Add and verify your mobile number first." };
  const sql = db();
  if (on) {
    if (channel === "email" ? !c.emailVerified : !c.phoneVerified) return { error: channel === "email" ? "Verify your email first." : "Verify your mobile number first." };
    if (!(await hasMarketingConsent(sql, channel, recipient))) {
      const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
      await sql`insert into shop.marketing_consents (channel, recipient, user_id, status, source, wording, evidence)
                values (${channel}, ${recipient}, ${c.id}, 'granted', 'account', ${WORDING[channel]}, ${sql.json({ ua, form: "account-v1" } as never)})`;
    }
  } else {
    await withdrawConsent(sql, channel, recipient, "account", { form: "account-v1" });
  }
  revalidatePath("/account");
  return { ok: true, message: on ? "You’re subscribed." : "You won’t receive these offers any more." };
}

// ------------------------------------------------------------------ security & deletion

export async function signOutEverywhereAction(): Promise<FormResult> {
  const c = await requireCustomer();
  await db()`update shop.customer_sessions set revoked_at = now() where customer_id = ${c.id} and id <> ${c.sessionId} and revoked_at is null`;
  revalidatePath("/account");
  return { ok: true, message: "Signed out of all other devices." };
}

/**
 * Deletes the account: personal data is removed or anonymised and all
 * marketing consent is withdrawn. Orders and invoices are kept (unlinked
 * from the person) because tax law requires them.
 */
export async function deleteAccountAction(_p: FormResult, f: FormData): Promise<FormResult> {
  const c = await requireCustomer();
  const [row] = await db()<{ hash: string }[]>`select password_hash as hash from shop.customers where id = ${c.id}`;
  if (!(await verifyPassword(String(f.get("password") ?? ""), row!.hash))) return { error: "Password is incorrect." };
  if (f.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  const sql = db();
  for (const [ch, r] of [["email", c.email], ["sms", c.phone], ["whatsapp", c.phone]] as const) {
    if (r) await withdrawConsent(sql, ch, r, "account", { reason: "account_deleted" });
  }
  await sql.begin(async (tx) => {
    await tx`delete from shop.addresses where user_id = ${c.id}`;
    await tx`delete from shop.wishlist_items where user_id = ${c.id}`;
    await tx`delete from shop.carts where user_id = ${c.id}`;
    await tx`delete from shop.customer_tokens where customer_id = ${c.id}`;
    await tx`update shop.customer_sessions set revoked_at = now() where customer_id = ${c.id}`;
    await tx`update shop.reviews set display_name = 'Verified buyer' where user_id = ${c.id}`;
    await tx`update shop.orders set user_id = null where user_id = ${c.id}`;
    await tx`update shop.customers set status = 'deleted', email = ${`deleted-${c.id}@deleted.invalid`}, full_name = 'Deleted customer',
             phone = null, phone_verified_at = null, password_hash = ${await hashPassword(randomBytes(24).toString("hex"))} where id = ${c.id}`;
    await tx`insert into shop.account_deletions (user_id_hash, completed_at) values (${createHash("sha256").update(c.id).digest("hex")}, now())`;
  });
  await endSession();
  redirect("/?account_deleted=1");
}

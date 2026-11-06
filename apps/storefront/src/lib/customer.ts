import "server-only";
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { processOutbox } from "@zentro/commerce/messaging";
import { CART_COOKIE } from "./cart-cookie";
import { db } from "./db";
import { providerEnv } from "./messaging-env";
import { siteUrl } from "./site";

export const SESSION_COOKIE = "zentro_session";
const SESSION_DAYS = 30;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

// ---------------------------------------------------------------- passwords (scrypt)

const N = 32768, R = 8, P = 1;
const scrypt = (pw: string, salt: Buffer, len: number, n = N, r = R, p = P) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw.normalize("NFKC"), salt, len, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${(await scrypt(pw, salt, 64)).toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), expected.length, Number(n), Number(r), Number(p));
  return got.length === expected.length && timingSafeEqual(got, expected);
}
export const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export function passwordProblem(pw: string, email: string): string | null {
  if (pw.length < 10 || pw.length > 128) return "Use at least 10 characters.";
  const local = email.split("@")[0] ?? "";
  if (local.length >= 4 && pw.toLowerCase().includes(local.toLowerCase())) return "Don’t include your email address in your password.";
  if (/^(.)\1+$/.test(pw) || /^(?:0123456789|1234567890|password|qwerty)/i.test(pw)) return "That password is too easy to guess.";
  return null;
}

// ---------------------------------------------------------------- sessions

export interface Customer {
  id: string; email: string; emailVerified: boolean; fullName: string; phone: string | null; phoneVerified: boolean; sessionId: string;
}

export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [c] = await db()<(Customer & { lastSeen: Date })[]>`
    select c.id, c.email, (c.email_verified_at is not null) as "emailVerified", c.full_name as "fullName", c.phone,
           (c.phone_verified_at is not null) as "phoneVerified", s.id as "sessionId", s.last_seen_at as "lastSeen"
    from shop.customer_sessions s join shop.customers c on c.id = s.customer_id
    where s.token_hash = ${sha256(token)} and s.revoked_at is null and s.expires_at > now() and c.status = 'active'`;
  if (!c) return null;
  if (Date.now() - c.lastSeen.getTime() > 3600_000) await db()`update shop.customer_sessions set last_seen_at = now() where id = ${c.sessionId}`;
  const { lastSeen: _ls, ...rest } = c;
  return rest;
});

export async function startSession(customerId: string) {
  const token = randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db()`insert into shop.customer_sessions (customer_id, token_hash, expires_at, user_agent)
             values (${customerId}, ${sha256(token)}, now() + make_interval(days => ${SESSION_DAYS}), ${ua})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400,
  });
  await db()`update shop.customers set last_login_at = now(), failed_logins = 0, locked_until = null where id = ${customerId}`;
  await mergeGuestCart(customerId);
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db()`update shop.customer_sessions set revoked_at = now() where token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

/** Moves a guest cart's items into the customer's cart on sign-in. */
async function mergeGuestCart(customerId: string) {
  const jar = await cookies();
  const guest = jar.get(CART_COOKIE)?.value;
  const sql = db();
  await sql.begin(async (tx) => {
    const [mine] = await tx<{ id: string }[]>`
      insert into shop.carts (user_id) values (${customerId}) on conflict (user_id) do update set updated_at = now() returning id`;
    if (!guest) return;
    const [g] = await tx<{ id: string }[]>`select id from shop.carts where guest_token_hash = ${sha256(guest)}`;
    if (!g) return;
    await tx`
      insert into shop.cart_items (cart_id, variant_id, quantity)
      select ${mine!.id}, variant_id, quantity from shop.cart_items where cart_id = ${g.id}
      on conflict (cart_id, variant_id) do update set quantity = least(10, shop.cart_items.quantity + excluded.quantity)`;
    await tx`delete from shop.carts where id = ${g.id}`;
  });
  jar.delete(CART_COOKIE);
}

// ---------------------------------------------------------------- tokens & messages

export async function issueToken(customerId: string, purpose: "verify_email" | "reset_password", minutes: number) {
  const token = randomBytes(32).toString("base64url");
  await db()`update shop.customer_tokens set used_at = now() where customer_id = ${customerId} and purpose = ${purpose} and used_at is null`;
  await db()`insert into shop.customer_tokens (customer_id, purpose, secret_hash, expires_at)
             values (${customerId}, ${purpose}, ${sha256(token)}, now() + make_interval(mins => ${minutes}))`;
  return token;
}

export async function consumeToken(token: string, purpose: "verify_email" | "reset_password"): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
  const [t] = await db()<{ customerId: string }[]>`
    update shop.customer_tokens set used_at = now()
    where secret_hash = ${sha256(token)} and purpose = ${purpose} and used_at is null and expires_at > now()
    returning customer_id as "customerId"`;
  return t?.customerId ?? null;
}

/** Queues an account email and sends it right away. Returns the honest outcome. */
export async function sendAccountMessage(channel: "email" | "sms", to: string, template: string, payload: Record<string, string>) {
  const sql = db();
  const [row] = await sql<{ id: string }[]>`
    insert into shop.notification_outbox (channel, recipient, template, kind, payload)
    values (${channel}, ${to}, ${template}, 'transactional', ${sql.json(payload as never)}) returning id::text`;
  await processOutbox(sql, providerEnv(), { onlyIds: [row!.id] });
  const [r] = await sql<{ status: string; lastError: string | null }[]>`select status, last_error as "lastError" from shop.notification_outbox where id = ${row!.id}`;
  return { sent: r?.status === "sent", status: r?.status ?? "queued", error: r?.lastError ?? null };
}

export async function sendVerificationEmail(c: { id: string; email: string; fullName: string }) {
  const token = await issueToken(c.id, "verify_email", 24 * 60);
  return sendAccountMessage("email", c.email, "verify_email", { name: c.fullName.split(" ")[0]!, actionLink: siteUrl(`/account/verify?token=${token}`) });
}

// ---------------------------------------------------------------- phone OTP

export async function startPhoneVerification(customerId: string, phone: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const sql = db();
  await sql`update shop.customer_tokens set used_at = now() where customer_id = ${customerId} and purpose = 'verify_phone' and used_at is null`;
  await sql`insert into shop.customer_tokens (customer_id, purpose, secret_hash, target, expires_at)
            values (${customerId}, 'verify_phone', ${sha256(customerId + ":" + code)}, ${phone}, now() + interval '10 minutes')`;
  return sendAccountMessage("sms", phone, "phone_otp", { code });
}

export async function checkPhoneCode(customerId: string, code: string): Promise<"ok" | "invalid" | "expired"> {
  const sql = db();
  const [t] = await sql<{ id: string; secretHash: string; target: string; attempts: number }[]>`
    select id, secret_hash as "secretHash", target, attempts from shop.customer_tokens
    where customer_id = ${customerId} and purpose = 'verify_phone' and used_at is null and expires_at > now()
    order by created_at desc limit 1`;
  if (!t || t.attempts >= 5) return "expired";
  const a = Buffer.from(t.secretHash), b = Buffer.from(sha256(customerId + ":" + code.trim()));
  if (!/^\d{6}$/.test(code.trim()) || !timingSafeEqual(a, b)) {
    await sql`update shop.customer_tokens set attempts = attempts + 1 where id = ${t.id}`;
    return "invalid";
  }
  await sql.begin(async (tx) => {
    await tx`update shop.customer_tokens set used_at = now() where id = ${t.id}`;
    await tx`update shop.customers set phone = ${t.target}, phone_verified_at = now() where id = ${customerId}`;
  });
  return "ok";
}

export async function rateLimited(bucket: string, limit: number, seconds: number) {
  const [r] = await db()<{ ok: boolean }[]>`select shop.rate_limit_hit(${bucket}, ${limit}, ${seconds}) as ok`;
  return !r?.ok;
}

export async function clientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

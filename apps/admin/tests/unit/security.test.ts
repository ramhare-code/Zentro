import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashPassword, verifyPassword } from "@/lib/crypto";
import { base32Decode, base32Encode, hotp, verifyTotp } from "@/lib/totp";
import { ALL_PERMISSIONS, isPermission } from "@/lib/permissions";
import { readFileSync } from "node:fs";

describe("TOTP (RFC 6238 test vectors, SHA-1)", () => {
  const secret = Buffer.from("12345678901234567890");
  const b32 = base32Encode(secret);
  it("base32 round-trips", () => {
    expect(base32Decode(b32).equals(secret)).toBe(true);
    expect(b32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("t=%i → %s", (t, code) => {
    expect(hotp(secret, Math.floor(t / 30))).toBe(code);
    expect(verifyTotp(b32, code, null, t * 1000)).toBe(Math.floor(t / 30));
  });
  it("rejects replay of an already-used step", () => {
    const step = Math.floor(59 / 30);
    expect(verifyTotp(b32, "287082", step, 59_000)).toBeNull();
  });
  it("rejects malformed codes", () => {
    expect(verifyTotp(b32, "12345", null)).toBeNull();
    expect(verifyTotp(b32, "abcdef", null)).toBeNull();
  });
});

describe("passwords", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("wrong password", h)).toBe(false);
    expect(await hashPassword("x".repeat(12))).not.toBe(await hashPassword("x".repeat(12)));
  });
});

describe("encryption at rest", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("round-trips and detects tampering", () => {
    const c = encrypt("JBSWY3DPEHPK3PXP", key);
    expect(decrypt(c, key)).toBe("JBSWY3DPEHPK3PXP");
    const bad = Buffer.from(c, "base64");
    bad[bad.length - 1]! ^= 1;
    expect(() => decrypt(bad.toString("base64"), key)).toThrow();
  });
});

describe("permissions", () => {
  it("every permission seeded in the database exists in code", () => {
    const sql = readFileSync(new URL("../../../../db/migrations/0002_admin_security.sql", import.meta.url), "utf8");
    const seeded = [...sql.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]!).filter((k) => !k.startsWith("shop."));
    expect(seeded.length).toBeGreaterThan(40);
    for (const k of seeded) expect(isPermission(k), k).toBe(true);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });
});

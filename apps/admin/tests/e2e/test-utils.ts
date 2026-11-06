import { randomBytes, scryptSync } from "node:crypto";
/** A valid scrypt hash in the storefront's format (customer password "test-password-123"). */
export async function hashPasswordForTest() {
  const salt = randomBytes(16);
  const key = scryptSync("test-password-123", salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

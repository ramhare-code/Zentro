import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  ADMIN_URL: z.string().url(),
  STOREFRONT_URL: z.string().url(),
  // 32 random bytes, base64. Encrypts MFA secrets at rest. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ADMIN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded"),
});

let cached: z.infer<typeof schema> | undefined;

export function adminEnv() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", ");
      throw new Error(`Invalid admin configuration: ${fields}. See apps/admin/.env.example.`);
    }
    if (parsed.data.APP_ENV !== "development" && !parsed.data.ADMIN_URL.startsWith("https://")) {
      throw new Error("ADMIN_URL must use https outside development.");
    }
    cached = parsed.data;
  }
  return cached;
}

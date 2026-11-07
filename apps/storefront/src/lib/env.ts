import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SELLER_STATE_CODE: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  CRON_SECRET: optional,
  BUSINESS_LEGAL_NAME: optional,
  BUSINESS_ADDRESS: optional,
  BUSINESS_GSTIN: optional,
  SUPPORT_EMAIL: optional,
  SUPPORT_PHONE: optional,
  SUPPORT_HOURS: optional,
  GRIEVANCE_OFFICER_NAME: optional,
  GRIEVANCE_OFFICER_EMAIL: optional,
});

let cached: z.infer<typeof schema> | undefined;

/** Server-side configuration, validated on first use. */
export function serverEnv() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server configuration: ${fields}. See .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Real business details only — any blank value is omitted, never invented. */

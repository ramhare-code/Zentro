import { defineConfig, devices } from "@playwright/test";

const port = 3201;
export const MESSAGING_ENV = {
  UNSUBSCRIBE_SECRET: "e2e-unsub-secret", NEXT_PUBLIC_BUSINESS_NAME: "Zentro",
  RESEND_API_KEY: "re_mock", EMAIL_FROM: "Zentro <orders@zentro.test>", RESEND_API_BASE: "http://localhost:3998",
  MSG91_AUTH_KEY: "msg91_mock", MSG91_API_BASE: "http://localhost:3998",
  WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "wa_mock", WHATSAPP_API_BASE: "http://localhost:3998",
};
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://zentro:zentro@localhost/zentro_admin_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["orders.spec.ts", "messaging.spec.ts", "reviews.spec.ts", "admin.spec.ts"],
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [{ command: "node tests/e2e/mock-messaging.mjs", port: 3998, reuseExistingServer: false }, {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DB, ADMIN_URL: `http://localhost:${port}`, STOREFRONT_URL: "http://localhost:3000", APP_ENV: "development",
           ADMIN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), ...MESSAGING_ENV },
  }],
});

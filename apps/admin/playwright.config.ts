import { defineConfig, devices } from "@playwright/test";

const port = 3201;
export const MESSAGING_ENV = {
  UNSUBSCRIBE_SECRET: "e2e-unsub-secret", NEXT_PUBLIC_BUSINESS_NAME: "Zentro", TICKET_LINK_SECRET: "e2e-ticket-secret",
  RESEND_API_KEY: "re_mock", EMAIL_FROM: "Zentro <orders@zentro.test>", RESEND_API_BASE: "http://localhost:3998",
  MSG91_AUTH_KEY: "msg91_mock", MSG91_API_BASE: "http://localhost:3998",
  WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "wa_mock", WHATSAPP_API_BASE: "http://localhost:3998",
};
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://zentro:zentro@localhost/zentro_admin_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["orders.spec.ts", "messaging.spec.ts", "reviews.spec.ts", "returns.spec.ts", "support.spec.ts", "catalog.spec.ts", "inventory.spec.ts", "payments.spec.ts", "finance.spec.ts", "marketing.spec.ts", "admin.spec.ts"],
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [{ command: "node tests/e2e/mock-messaging.mjs", port: 3998, reuseExistingServer: false },
    { command: "node ../storefront/tests/e2e/mock-razorpay.mjs", port: 3999, reuseExistingServer: false },
    // the real storefront on the same database, to verify admin changes reach customers
    { command: "npx next start -p 3202", cwd: "../storefront", port: 3202, reuseExistingServer: false, timeout: 120_000,
      env: { DATABASE_URL: E2E_DB, APP_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://localhost:3202", SELLER_STATE_CODE: "KA", REVALIDATE_SECRET: "e2e-revalidate" } }, {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DB, ADMIN_URL: `http://localhost:${port}`, STOREFRONT_URL: "http://localhost:3202", REVALIDATE_SECRET: "e2e-revalidate", APP_ENV: "development",
           ADMIN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), ...MESSAGING_ENV,
           RAZORPAY_KEY_ID: "rzp_test_mock", RAZORPAY_KEY_SECRET: "mock_secret", RAZORPAY_API_BASE: "http://localhost:3999", SELLER_STATE_CODE: "KA" },
  }],
});

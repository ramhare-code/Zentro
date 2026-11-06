import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://zentro:zentro@localhost/zentro_store_e2e";
export const CRON_SECRET = "e2e-cron-secret-0123456789";
export const WEBHOOK_SECRET = "whsec_mock";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /checkout\.spec/ },
  ],
  webServer: [
    { command: "node tests/e2e/mock-razorpay.mjs", port: 3999, reuseExistingServer: false },
    { command: "node ../admin/tests/e2e/mock-messaging.mjs", port: 3998, reuseExistingServer: false },
    {
      command: `npx next start -p ${port}`,
      port,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: E2E_DB, APP_ENV: "development", NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`, SELLER_STATE_CODE: "KA",
        RAZORPAY_KEY_ID: "rzp_test_mock", RAZORPAY_KEY_SECRET: "mock_secret", RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
        RAZORPAY_API_BASE: "http://localhost:3999", CRON_SECRET, UNSUBSCRIBE_SECRET: "e2e-unsub-secret",
        RESEND_API_KEY: "re_mock", EMAIL_FROM: "Zentro <orders@zentro.test>", RESEND_API_BASE: "http://localhost:3998",
        MSG91_AUTH_KEY: "msg91_mock", MSG91_API_BASE: "http://localhost:3998",
      },
    },
  ],
});

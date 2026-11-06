import { defineConfig, devices } from "@playwright/test";

const port = 3201;
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://zentro:zentro@localhost/zentro_admin_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DB, ADMIN_URL: `http://localhost:${port}`, STOREFRONT_URL: "http://localhost:3000", APP_ENV: "development",
           ADMIN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") },
  },
});

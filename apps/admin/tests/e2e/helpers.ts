import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";
import { base32Decode, currentStep, hotp } from "../../src/lib/totp";

export const db = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });
export const PASSWORD = "violet harbour lantern 42";

export function createOwnerInvite(email: string, name: string): string {
  const out = execFileSync("node", [path.resolve(import.meta.dirname, "../../../../scripts/create-owner.mjs"), "--email", email, "--name", name], {
    env: { ...process.env, DATABASE_URL: E2E_DB, ADMIN_URL: "http://localhost:3201" },
    encoding: "utf8",
  });
  const m = out.match(/http:\/\/localhost:3201\/invite\/\S+/);
  if (!m) throw new Error(out);
  return m[0];
}

/** Next code, never one already used (replay protection would reject it). */
export async function totpFor(secret: string, avoidStep?: number) {
  let step = currentStep();
  if (avoidStep !== undefined && step <= avoidStep) {
    await new Promise((r) => setTimeout(r, (30 - (Date.now() / 1000) % 30) * 1000 + 300));
    step = currentStep();
  }
  return { code: hotp(base32Decode(secret), step), step };
}

/** Completes an invitation and returns the TOTP secret. */
export async function acceptInvite(page: Page, link: string): Promise<{ secret: string; step: number }> {
  await page.goto(link);
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("heading", { name: "Set up two-step verification" })).toBeVisible();
  await page.getByText("Can’t scan? Enter the key manually").click();
  const secret = (await page.locator("code").first().textContent())!.replace(/\s/g, "");
  const { code, step } = await totpFor(secret);
  await page.getByLabel("Code from your app").fill(code);
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(10);
  await page.getByRole("link", { name: "I’ve saved them — continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return { secret, step };
}

export async function login(page: Page, email: string, secret: string, avoidStep?: number) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  const { code, step } = await totpFor(secret, avoidStep);
  await page.getByLabel("Authentication code").fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return step;
}

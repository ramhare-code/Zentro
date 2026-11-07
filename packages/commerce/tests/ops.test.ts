import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LATEST_MIGRATION } from "../src/ops";

describe("health check", () => {
  it("expects the newest migration file", () => {
    const files = readdirSync(path.resolve(import.meta.dirname, "../../../db/migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(LATEST_MIGRATION).toBe(files.at(-1));
  });
});

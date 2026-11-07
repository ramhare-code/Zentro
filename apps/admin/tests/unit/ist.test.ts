import { describe, expect, it } from "vitest";
import { istLocal, parseIstLocal } from "@/lib/ist";

describe("IST date inputs", () => {
  it("round-trips", () => {
    const d = parseIstLocal("2026-11-07T09:30")!;
    expect(d.toISOString()).toBe("2026-11-07T04:00:00.000Z");
    expect(istLocal(d)).toBe("2026-11-07T09:30");
  });
  it("handles blanks and junk", () => {
    expect(parseIstLocal("")).toBeNull();
    expect(Number.isNaN(parseIstLocal("tomorrow")!.getTime())).toBe(true);
    expect(istLocal(null)).toBe("");
  });
});

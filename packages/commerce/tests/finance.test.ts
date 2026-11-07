import { describe, expect, it } from "vitest";
import { financialYear, prorate } from "../src/orders";

describe("finance helpers", () => {
  it("labels the Indian financial year in IST", () => {
    expect(financialYear(new Date("2026-04-01T00:00:00+05:30"))).toBe("2026-27");
    expect(financialYear(new Date("2026-03-31T23:59:00+05:30"))).toBe("2025-26");
    expect(financialYear(new Date("2026-03-31T19:00:00Z"))).toBe("2026-27"); // already 1 April in India
    expect(financialYear(new Date("2099-12-31T00:00:00Z"))).toBe("2099-00");
  });

  it("prorates to an exact integer total", () => {
    expect(prorate([8475, 763, 762], 5000)).toEqual([4238, 381, 381].map((v, i, a) => v + (i === 0 ? 5000 - a.reduce((x, y) => x + y, 0) : 0)));
    const out = prorate([1, 1, 1], 100);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
    expect(prorate([0, 0], 50)).toEqual([0, 0]);
    expect(prorate([0, 10, 0], 7)).toEqual([0, 7, 0]);
  });
});

import { gstinProblem } from "../src/states";
describe("GSTIN validation", () => {
  it("accepts a valid GSTIN in its own state", () => {
    expect(gstinProblem("27AAPFU0939F1ZV", "MH")).toBeNull();
    expect(gstinProblem("29AAGCB7383J1Z4", "KA")).toBeNull();
  });
  it("rejects bad format, wrong state and bad check digit", () => {
    expect(gstinProblem("29ABC", "KA")).toMatch(/15 characters/);
    expect(gstinProblem("27AAPFU0939F1ZV", "KA")).toMatch(/another state/);
    expect(gstinProblem("27AAPFU0939F1ZX", "MH")).toMatch(/check digit/);
  });
});

import { describe, expect, it } from "vitest";
import { discountPercent, formatPaise } from "@zentro/commerce";
import { stockLabel, stockState } from "@zentro/commerce";

describe("money", () => {
  it("formats paise as Indian rupees", () => {
    expect(formatPaise(499900)).toBe("₹4,999");
    expect(formatPaise(12345678)).toBe("₹1,23,456.78");
  });
  it("never overstates a discount", () => {
    expect(discountPercent(799900, 499900)).toBe(37);
    expect(discountPercent(100, 100)).toBe(0);
    expect(discountPercent(0, 100)).toBe(0);
  });
});

describe("stock", () => {
  it("labels stock levels", () => {
    expect(stockState(0)).toBe("out_of_stock");
    expect(stockLabel(3)).toBe("Only 3 left");
    expect(stockLabel(40)).toBe("In stock");
  });
});

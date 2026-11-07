import { describe, expect, it } from "vitest";
import { couponDiscount, priceLines } from "../src/pricing";
import { verifyPaymentSignature, verifyWebhookSignature } from "../src/razorpay";
import { createHmac } from "node:crypto";

describe("couponDiscount", () => {
  const pct = { code: "X", discountType: "percent" as const, discountValue: 10, maxDiscountPaise: 30000, minOrderPaise: 99900 };
  it("applies percent with cap and minimum", () => {
    expect(couponDiscount(99800, pct)).toBe(0);
    expect(couponDiscount(100000, pct)).toBe(10000);
    expect(couponDiscount(1000000, pct)).toBe(30000);
  });
  it("never exceeds subtotal", () => {
    expect(couponDiscount(5000, { ...pct, discountType: "fixed", discountValue: 9999, maxDiscountPaise: null, minOrderPaise: 0 })).toBe(5000);
  });
});

describe("priceLines", () => {
  const lines = [
    { variantId: "a", quantity: 1, unitPricePaise: 499900, gstRate: 18 },
    { variantId: "b", quantity: 3, unitPricePaise: 79900, gstRate: 12 },
  ];
  it("discount shares sum exactly to the discount", () => {
    for (const d of [0, 1, 7, 12345, 30000]) {
      const r = priceLines(lines, d, true);
      expect(r.reduce((a, l) => a + l.discountPaise, 0)).toBe(d);
    }
  });
  it("taxable + tax equals the GST-inclusive line total", () => {
    for (const intra of [true, false]) {
      for (const l of priceLines(lines, 12345, intra)) {
        expect(l.taxablePaise + l.cgstPaise + l.sgstPaise + l.igstPaise).toBe(l.lineTotalPaise);
        if (intra) expect(l.igstPaise).toBe(0); else expect(l.cgstPaise + l.sgstPaise).toBe(0);
      }
    }
  });
  it("splits 18% GST correctly on ₹4,999", () => {
    const [l] = priceLines([lines[0]!], 0, true);
    expect(l!.taxablePaise).toBe(423644); // 4999 / 1.18
    expect(l!.cgstPaise + l!.sgstPaise).toBe(76256);
  });
});

describe("Razorpay signatures", () => {
  const cfg = { keyId: "rzp_test_x", keySecret: "s3cret" };
  it("accepts a valid checkout signature and rejects a forged one", () => {
    const sig = createHmac("sha256", "s3cret").update("order_1|pay_1").digest("hex");
    expect(verifyPaymentSignature(cfg, "order_1", "pay_1", sig)).toBe(true);
    expect(verifyPaymentSignature(cfg, "order_1", "pay_2", sig)).toBe(false);
    expect(verifyPaymentSignature(cfg, "order_1", "pay_1", "00")).toBe(false);
  });
  it("verifies webhook bodies byte-for-byte", () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac("sha256", "wh").update(body).digest("hex");
    expect(verifyWebhookSignature("wh", body, sig)).toBe(true);
    expect(verifyWebhookSignature("wh", body + " ", sig)).toBe(false);
  });
});

describe("coupon limited to some lines", () => {
  const lines = [
    { variantId: "a", quantity: 1, unitPricePaise: 100000, gstRate: 18 },
    { variantId: "b", quantity: 2, unitPricePaise: 50000, gstRate: 5 },
  ];
  it("puts the whole discount on eligible lines only", () => {
    const out = priceLines(lines, 10001, true, [false, true]);
    expect(out[0]!.discountPaise).toBe(0);
    expect(out[0]!.lineTotalPaise).toBe(100000);
    expect(out[1]!.discountPaise).toBe(10001);
    expect(out.reduce((a, l) => a + l.discountPaise, 0)).toBe(10001);
  });
  it("refuses a discount larger than the eligible lines", () => {
    expect(() => priceLines(lines, 100001, true, [false, true])).toThrow();
  });
  it("behaves as before without an eligibility list", () => {
    expect(priceLines(lines, 300, false).map((l) => l.discountPaise)).toEqual([150, 150]);
  });
});

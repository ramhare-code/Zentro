import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone } from "@/lib/mask";
import { canTransition } from "@zentro/commerce";

describe("masking", () => {
  it("hides most of an email and phone", () => {
    expect(maskEmail("priya.sharma@example.com")).toBe("p••••••@example.com");
    expect(maskEmail("a@b.co")).toBe("a••@b.co");
    expect(maskPhone("9876543210")).toBe("••••••3210");
  });
});

describe("order transitions", () => {
  it("allows only valid moves", () => {
    expect(canTransition("confirmed", "processing")).toBe(true);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  inPromoWindow, nextWindowOpen, normaliseRecipient, renderTemplate, templateVariables, unknownVariables,
  unsubscribeLink, verifyUnsubscribe,
} from "../src/messaging";

describe("templates", () => {
  const body = "Hi {{name}}, order {{ order_number }} ships via {{carrier}}. {{name}}!";
  it("lists variables in first-appearance order (WhatsApp params are positional)", () => {
    expect(templateVariables(body)).toEqual(["name", "order_number", "carrier"]);
  });
  it("renders known variables and blanks missing ones", () => {
    expect(renderTemplate(body, { name: "Priya", order_number: "ZN1" })).toBe("Hi Priya, order ZN1 ships via . Priya!");
  });
  it("flags unknown variables", () => {
    expect(unknownVariables("Hello {{name}} {{password}}")).toEqual(["password"]);
  });
});

describe("recipients & unsubscribe", () => {
  it("normalises phone numbers and emails", () => {
    expect(normaliseRecipient("sms", "+91 98765-43210")).toBe("9876543210");
    expect(normaliseRecipient("sms", "12345")).toBeNull();
    expect(normaliseRecipient("email", " Priya@Example.COM ")).toBe("priya@example.com");
  });
  it("signs unsubscribe links per channel and recipient", () => {
    const url = new URL(unsubscribeLink("https://shop.example", "sekret", "sms", "9876543210"));
    const sig = url.searchParams.get("s")!;
    expect(verifyUnsubscribe("sekret", "sms", "9876543210", sig)).toBe(true);
    expect(verifyUnsubscribe("sekret", "whatsapp", "9876543210", sig)).toBe(false);
    expect(verifyUnsubscribe("sekret", "sms", "9876543211", sig)).toBe(false);
    expect(verifyUnsubscribe("other", "sms", "9876543210", sig)).toBe(false);
  });
});

describe("promotional window (IST)", () => {
  const w = { promoWindowStart: "10:00", promoWindowEnd: "21:00" };
  it("is open 10:00–21:00 India time", () => {
    expect(inPromoWindow(w, new Date("2026-11-06T04:30:00Z"))).toBe(true);  // 10:00 IST
    expect(inPromoWindow(w, new Date("2026-11-06T15:29:00Z"))).toBe(true);  // 20:59 IST
    expect(inPromoWindow(w, new Date("2026-11-06T15:30:00Z"))).toBe(false); // 21:00 IST
    expect(inPromoWindow(w, new Date("2026-11-06T02:00:00Z"))).toBe(false); // 07:30 IST
  });
  it("defers to the next 10:00 IST", () => {
    expect(nextWindowOpen(w, new Date("2026-11-06T16:00:00Z")).toISOString()).toBe("2026-11-07T04:30:00.000Z");
    expect(nextWindowOpen(w, new Date("2026-11-06T02:00:00Z")).toISOString()).toBe("2026-11-06T04:30:00.000Z");
  });
});

import { describe, expect, it } from "vitest";
import { parseMoney, parseSettlementReport } from "../../src/lib/settlement";

describe("settlement report parsing", () => {
  it("parses rupee amounts with thousands separators", () => {
    expect(parseMoney("1,299.50", "rupees")).toBe(129950);
    expect(parseMoney("₹ 12", "rupees")).toBe(1200);
    expect(parseMoney("12.345", "rupees")).toBeNaN();
    expect(parseMoney("", "rupees")).toBeNull();
    expect(parseMoney("129950", "paise")).toBe(129950);
    expect(parseMoney("1.5", "paise")).toBeNaN();
  });

  it("classifies payments and refunds and reads fees", () => {
    const r = parseSettlementReport([
      ["entity_id", "type", "debit", "credit", "amount", "fee", "tax", "settlement_id", "settled_at"],
      ["pay_A1", "payment", "0", "1000.00", "1000.00", "23.60", "3.60", "setl_9", "2026-11-01 10:00:00"],
      ["rfnd_B2", "refund", "250.00", "0", "", "", "", "setl_9", ""],
      ["adj_C3", "adjustment", "0", "5", "5", "", "", "setl_9", ""],
      ["pay_A1", "payment", "0", "1000.00", "1000.00", "23.60", "3.60", "setl_9", ""],
      ["", "", "", "", "", "", "", "", ""],
    ], "rupees");
    expect(r.errors).toEqual([]);
    expect(r.lines.map((l) => [l.type, l.entityId, l.amountPaise, l.feePaise])).toEqual([
      ["payment", "pay_A1", 100000, 2360], ["refund", "rfnd_B2", 25000, null], ["other", "adj_C3", 500, null],
    ]);
    expect(r.lines[0]!.settlementId).toBe("setl_9");
    expect(r.lines[0]!.settledAt).toMatch(/^2026-11-01/);
  });

  it("reports missing columns and bad numbers", () => {
    expect(parseSettlementReport([["foo", "bar"]], "rupees").errors[0]).toContain("id column");
    expect(parseSettlementReport([["id", "amount"], ["pay_X", "ten"]], "rupees").errors[0]).toContain("Row 2");
  });
});

import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv-out";

describe("CSV output", () => {
  it("neutralises formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+91 98765")).toBe(`"'+91 98765"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell(-3)).toBe("-3");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "x\ny", null]])).toBe(`"a,b","say ""hi""","x\ny",\r\n`);
  });
});

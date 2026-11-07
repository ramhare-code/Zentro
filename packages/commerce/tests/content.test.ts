import { describe, expect, it } from "vitest";
import { contentWarnings, fillPlaceholders, parseContent, parseInline } from "../src/content";

describe("content format", () => {
  it("parses headings, paragraphs and lists", () => {
    const b = parseContent("## Returns\n\nYou can return\nwithin a week.\n\n- One\n- Two\n1. First\n\n### Note\nDone");
    expect(b.map((x) => x.type)).toEqual(["h2", "p", "ul", "ol", "h3", "p"]);
    expect(b[1]).toEqual({ type: "p", text: [{ t: "text", v: "You can return within a week." }] });
    expect(b[2]).toMatchObject({ type: "ul", items: [[{ t: "text", v: "One" }], [{ t: "text", v: "Two" }]] });
  });

  it("allows only safe links, never HTML", () => {
    expect(parseInline("See **this** and [help](/help), [mail](mailto:a@b.in)")).toEqual([
      { t: "text", v: "See " }, { t: "b", v: "this" }, { t: "text", v: " and " }, { t: "a", v: "help", href: "/help" },
      { t: "text", v: ", " }, { t: "a", v: "mail", href: "mailto:a@b.in" },
    ]);
    expect(parseInline("[x](javascript:alert)").every((n) => n.t === "text")).toBe(true);
    expect(parseInline("[x](//evil.com)").every((n) => n.t === "text")).toBe(true);
    const html = parseContent("<script>alert(1)</script>");
    expect(html).toEqual([{ type: "p", text: [{ t: "text", v: "<script>alert(1)</script>" }] }]);
  });

  it("fills placeholders and warns about gaps", () => {
    expect(fillPlaceholders("Write to {email} at {business}", { business: "Zentro" })).toBe("Write to {email} at Zentro");
    const w = contentWarnings("Hi {email} {nope} [a](javascript:x) <b>", { business: "Zentro" });
    expect(w).toHaveLength(4);
  });
});

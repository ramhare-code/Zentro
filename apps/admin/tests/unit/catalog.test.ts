import { describe, expect, it } from "vitest";
import { parseCsv, parseOptions, slugify } from "@/lib/csv";
import { imageSize, sniffImage } from "@/lib/media";

describe("csv", () => {
  it("parses quotes, escaped quotes, commas and CRLF", () => {
    expect(parseCsv('a,b,c\r\n"x, y","he said ""hi""",3\n\n')).toEqual([["a", "b", "c"], ["x, y", 'he said "hi"', "3"]]);
  });
  it("handles BOM, trailing newline and empty fields", () => {
    expect(parseCsv("﻿slug,name\nlamp,\n")).toEqual([["slug", "name"], ["lamp", ""]]);
  });
  it("rejects unclosed quotes", () => {
    expect(() => parseCsv('a,"b\n')).toThrow();
  });
  it("parses variant options", () => {
    expect(parseOptions("Color=Black; Size=UK 8")).toEqual({ Color: "Black", Size: "UK 8" });
    expect(parseOptions("")).toEqual({});
    expect(parseOptions("Color")).toBeNull();
  });
  it("slugifies", () => {
    expect(slugify("  Café Lamp — 2.0!! ")).toBe("cafe-lamp-2-0");
  });
});

describe("image sniffing", () => {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  it("detects PNG and reads its size", () => {
    expect(sniffImage(png)).toBe("image/png");
    expect(imageSize(png, "image/png")).toEqual({ width: 640, height: 480 });
  });
  it("detects JPEG and rejects disguised files", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(Buffer.from("GIF89a......"))).toBeNull();
  });
});

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). Returns rows of strings. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", i = 0, quoted = false;
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === "") { quoted = true; i++; continue; }
    if (ch === ",") { row.push(field); field = ""; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch; i++;
  }
  if (quoted) throw new Error("Unclosed quote in CSV");
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** "Color=Black; Size=M" → { Color: "Black", Size: "M" } */
export function parseOptions(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of s.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    const key = k?.trim(), val = v.join("=").trim();
    if (!key || !val || key.length > 30 || val.length > 60) return null;
    out[key] = val;
  }
  return out;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

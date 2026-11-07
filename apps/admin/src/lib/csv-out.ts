/** CSV cell: quotes when needed and neutralises spreadsheet formulas (=, +, -, @ at the start of text). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const s = v instanceof Date ? v.toISOString() : String(v);
  const guarded = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) || guarded !== s ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
export const rupees = (p: number | null | undefined) => (p === null || p === undefined ? "" : (p / 100).toFixed(2));

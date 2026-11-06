// Parses a Razorpay settlement / payments report (CSV) into typed lines.
// Pure (no DB) so it can be unit tested. Column names vary between report
// types, so common aliases are accepted.

export interface SettlementLine {
  row: number; type: "payment" | "refund" | "other"; entityId: string;
  amountPaise: number; feePaise: number | null; taxPaise: number | null; settlementId: string | null; settledAt: string | null;
}

const ALIASES = {
  entity: ["entity_id", "payment_id", "id"],
  type: ["type", "entity_type", "entity"],
  amount: ["amount", "credit", "amount_settled"],
  debit: ["debit"],
  fee: ["fee", "fees", "fee (exclusive tax)"],
  tax: ["tax", "gst"],
  settlement: ["settlement_id"],
  settledAt: ["settled_at", "settled_on", "settlement_date"],
} satisfies Record<string, string[]>;
type Col = keyof typeof ALIASES;

export function parseMoney(raw: string, unit: "rupees" | "paise"): number | null {
  const s = raw.replace(/[₹,\s]/g, "");
  if (s === "") return null;
  if (unit === "paise") return /^-?\d+$/.test(s) ? Number(s) : NaN;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

export function parseSettlementReport(rows: string[][], unit: "rupees" | "paise"): { lines: SettlementLine[]; errors: string[] } {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (k: Col) => { for (const a of ALIASES[k] as string[]) { const i = header.indexOf(a); if (i >= 0) return i; } return -1; };
  const I = Object.fromEntries((Object.keys(ALIASES) as Col[]).map((k) => [k, idx(k)])) as Record<Col, number>;
  const errors: string[] = [];
  if (I.entity < 0) errors.push("Missing an id column (entity_id, payment_id or id).");
  if (I.amount < 0 && I.debit < 0) errors.push("Missing an amount column (amount, credit or debit).");
  if (errors.length) return { lines: [], errors };
  const lines: SettlementLine[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.every((c) => c.trim() === "")) continue;
    const get = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const entityId = get(I.entity);
    const t = get(I.type).toLowerCase();
    const type: SettlementLine["type"] = entityId.startsWith("pay_") || t === "payment" ? "payment" : entityId.startsWith("rfnd_") || t === "refund" ? "refund" : "other";
    let amount = parseMoney(get(I.amount), unit);
    if ((amount === null || amount === 0) && I.debit >= 0) amount = parseMoney(get(I.debit), unit);
    const fee = parseMoney(get(I.fee), unit), tax = parseMoney(get(I.tax), unit);
    if (!entityId) { errors.push(`Row ${r + 1}: no id.`); continue; }
    if (amount === null || Number.isNaN(amount) || Number.isNaN(fee) || Number.isNaN(tax)) { errors.push(`Row ${r + 1} (${entityId}): amounts must be numbers${unit === "paise" ? " in paise" : " in rupees"}.`); continue; }
    if (seen.has(entityId)) continue; // reports can list an entity on several lines (e.g. fee adjustments)
    seen.add(entityId);
    const settledRaw = get(I.settledAt);
    const settledAt = settledRaw && !Number.isNaN(Date.parse(/^\d+$/.test(settledRaw) ? Number(settledRaw) * 1000 + "" : settledRaw))
      ? new Date(/^\d+$/.test(settledRaw) ? Number(settledRaw) * 1000 : settledRaw).toISOString() : null;
    lines.push({ row: r + 1, type, entityId, amountPaise: Math.abs(amount), feePaise: fee === null ? null : Math.abs(fee), taxPaise: tax === null ? null : Math.abs(tax), settlementId: get(I.settlement) || null, settledAt });
  }
  return { lines, errors: errors.slice(0, 20) };
}

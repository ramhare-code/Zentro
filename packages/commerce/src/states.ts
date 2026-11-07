/** Indian states and union territories (ISO 3166-2:IN codes) — used for GST place of supply. */
export const INDIAN_STATES = [
  ["AN", "Andaman and Nicobar Islands"], ["AP", "Andhra Pradesh"], ["AR", "Arunachal Pradesh"], ["AS", "Assam"],
  ["BR", "Bihar"], ["CH", "Chandigarh"], ["CT", "Chhattisgarh"], ["DH", "Dadra and Nagar Haveli and Daman and Diu"],
  ["DL", "Delhi"], ["GA", "Goa"], ["GJ", "Gujarat"], ["HR", "Haryana"], ["HP", "Himachal Pradesh"],
  ["JK", "Jammu and Kashmir"], ["JH", "Jharkhand"], ["KA", "Karnataka"], ["KL", "Kerala"], ["LA", "Ladakh"],
  ["LD", "Lakshadweep"], ["MP", "Madhya Pradesh"], ["MH", "Maharashtra"], ["MN", "Manipur"], ["ML", "Meghalaya"],
  ["MZ", "Mizoram"], ["NL", "Nagaland"], ["OR", "Odisha"], ["PY", "Puducherry"], ["PB", "Punjab"], ["RJ", "Rajasthan"],
  ["SK", "Sikkim"], ["TN", "Tamil Nadu"], ["TG", "Telangana"], ["TR", "Tripura"], ["UP", "Uttar Pradesh"],
  ["UT", "Uttarakhand"], ["WB", "West Bengal"],
] as const;

export type StateCode = (typeof INDIAN_STATES)[number][0];
export const STATE_CODES: readonly string[] = INDIAN_STATES.map(([c]) => c);
export const stateName = (code: string) => INDIAN_STATES.find(([c]) => c === code)?.[1] ?? code;

/** GST state codes (first two digits of a GSTIN). */
export const GST_STATE_CODES: Record<StateCode, string> = {
  JK: "01", HP: "02", PB: "03", CH: "04", UT: "05", HR: "06", DL: "07", RJ: "08", UP: "09", BR: "10", SK: "11", AR: "12",
  NL: "13", MN: "14", MZ: "15", TR: "16", ML: "17", AS: "18", WB: "19", JH: "20", OR: "21", CT: "22", MP: "23", GJ: "24",
  DH: "26", MH: "27", KA: "29", GA: "30", LD: "31", KL: "32", TN: "33", PY: "34", AN: "35", TG: "36", AP: "37", LA: "38",
};

/** Checks a GSTIN's format, its state prefix and its check digit. Returns an error message or null. */
export function gstinProblem(gstin: string, stateCode?: string | null): string | null {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return "A GSTIN looks like 29ABCDE1234F1Z5 (15 characters).";
  if (stateCode && GST_STATE_CODES[stateCode as StateCode] !== gstin.slice(0, 2)) return `This GSTIN is registered in another state (code ${gstin.slice(0, 2)}), not ${stateCode}.`;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(gstin[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  if (chars[(36 - (sum % 36)) % 36] !== gstin[14]) return "The GSTIN’s last character (check digit) doesn’t match — please re-check it.";
  return null;
}

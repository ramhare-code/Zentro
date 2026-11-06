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

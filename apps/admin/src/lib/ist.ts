/** Date → value for <input type="datetime-local"> in IST. */
export function istLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(new Date(d).getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value interpreted as IST → Date (null if blank, NaN-date if invalid). */
export function parseIstLocal(v: string): Date | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return new Date(NaN);
  return new Date(v + ":00+05:30");
}

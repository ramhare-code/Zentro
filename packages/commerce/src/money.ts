const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** 499900 → "₹4,999"; 49950 → "₹499.5" is avoided by always using 2dp when needed. */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  if (Number.isInteger(rupees)) return inr.format(rupees);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(rupees);
}

/** Whole-number percentage saved versus MRP (floored, so we never overstate). */
export function discountPercent(mrpPaise: number, pricePaise: number): number {
  if (!mrpPaise || mrpPaise <= pricePaise) return 0;
  return Math.floor(((mrpPaise - pricePaise) / mrpPaise) * 100);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

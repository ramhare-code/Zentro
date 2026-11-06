// Pure pricing maths (no I/O) so it can be unit-tested exhaustively.
// All amounts are integer paise. Catalogue prices INCLUDE GST.

export interface PricedLine {
  variantId: string;
  quantity: number;
  unitPricePaise: number;
  gstRate: number; // e.g. 18
}

export interface Coupon {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number; // percent (1–90) or paise
  maxDiscountPaise: number | null;
  minOrderPaise: number;
}

export interface LineTotals extends PricedLine {
  grossPaise: number;     // unit × qty
  discountPaise: number;  // share of order discount
  lineTotalPaise: number; // gross − discount (GST inclusive)
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export function couponDiscount(subtotalPaise: number, c: Coupon): number {
  if (subtotalPaise < c.minOrderPaise) return 0;
  let d = c.discountType === "percent" ? Math.floor((subtotalPaise * c.discountValue) / 100) : c.discountValue;
  if (c.maxDiscountPaise !== null) d = Math.min(d, c.maxDiscountPaise);
  return Math.max(0, Math.min(d, subtotalPaise));
}

/**
 * Spreads an order-level discount across lines in proportion to value
 * (largest-remainder, so shares always sum exactly), then splits each
 * GST-inclusive line into taxable value + CGST/SGST (intra-state) or IGST.
 */
export function priceLines(lines: PricedLine[], discountPaise: number, intraState: boolean): LineTotals[] {
  const gross = lines.map((l) => l.unitPricePaise * l.quantity);
  const subtotal = gross.reduce((a, b) => a + b, 0);
  const exact = gross.map((g) => (subtotal ? (g * discountPaise) / subtotal : 0));
  const shares = exact.map(Math.floor);
  let remainder = discountPaise - shares.reduce((a, b) => a + b, 0);
  exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (remainder > 0) {
        shares[i]! += 1;
        remainder -= 1;
      }
    });

  return lines.map((l, i) => {
    const lineTotal = gross[i]! - shares[i]!;
    const taxable = Math.round((lineTotal * 100) / (100 + l.gstRate));
    const tax = lineTotal - taxable;
    const cgst = intraState ? Math.floor(tax / 2) : 0;
    const sgst = intraState ? tax - cgst : 0;
    return {
      ...l,
      grossPaise: gross[i]!,
      discountPaise: shares[i]!,
      lineTotalPaise: lineTotal,
      taxablePaise: taxable,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: intraState ? 0 : tax,
    };
  });
}

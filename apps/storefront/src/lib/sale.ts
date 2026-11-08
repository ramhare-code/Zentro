import "server-only";
import { cache } from "react";
import { db } from "./db";

export interface CurrentSale {
  name: string;
  badge: string;
  endsAt: Date;
  /** Biggest percentage off across all running promotions (null when only fixed-amount offers run). */
  maxPercent: number | null;
  /** Biggest fixed amount off, in paise. */
  maxFixedPaise: number | null;
}

/**
 * The headline sale right now: the running promotion that covers the most of the
 * store (whole store first), with the best discount among everything running.
 * Returns null when nothing runs, so festive banners disappear on their own.
 */
export const getCurrentSale = cache(async (): Promise<CurrentSale | null> => {
  try {
    const rows = await db()<{ name: string; badge: string; endsAt: Date; appliesTo: string; type: "percent" | "fixed"; value: number }[]>`
      select name, badge, ends_at as "endsAt", applies_to as "appliesTo", discount_type as type, discount_value as value
      from shop.promotions
      where is_active and starts_at <= now() and ends_at > now()
      order by (applies_to = 'all') desc, case when discount_type = 'percent' then discount_value else 0 end desc, starts_at desc`;
    const lead = rows[0];
    if (!lead) return null;
    const pct = rows.filter((r) => r.type === "percent").map((r) => r.value);
    const fixed = rows.filter((r) => r.type === "fixed").map((r) => r.value);
    return {
      name: lead.name, badge: lead.badge, endsAt: lead.endsAt,
      maxPercent: pct.length ? Math.max(...pct) : null,
      maxFixedPaise: fixed.length ? Math.max(...fixed) : null,
    };
  } catch {
    return null; // a sale banner must never break the page
  }
});

export function saleOffer(s: CurrentSale): string {
  if (s.maxPercent) return `Up to ${s.maxPercent}% off`;
  if (s.maxFixedPaise) return `Up to ₹${Math.round(s.maxFixedPaise / 100).toLocaleString("en-IN")} off`;
  return "Special prices";
}

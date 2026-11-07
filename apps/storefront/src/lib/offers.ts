import "server-only";
import { db } from "./db";

/** Coupons the owner chose to advertise. Eligibility is still checked when applied. */
export async function publicOffers() {
  return db()<{ code: string; description: string }[]>`
    select code, description from shop.coupons
    where is_public and is_active and archived_at is null
      and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
      and (usage_limit is null or used_count < usage_limit)
    order by created_at desc limit 5`;
}

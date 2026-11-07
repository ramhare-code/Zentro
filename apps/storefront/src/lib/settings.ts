import "server-only";
import { cache } from "react";
import { loadStoreSettings, type StoreSettings } from "@zentro/commerce/settings";
import { db } from "./db";

/** Store settings for this request (database first, environment as fallback). */
export const getSettings = cache((): Promise<StoreSettings> => loadStoreSettings(db()));

/** Business details in the shape pages use (unset values are undefined). */
export async function getBusiness() {
  const s = await getSettings();
  const v = (x: string | null) => x ?? undefined;
  return {
    name: s.businessName, legalName: v(s.legalName), address: v(s.address), gstin: v(s.gstin),
    supportEmail: v(s.supportEmail), supportPhone: v(s.supportPhone), supportHours: v(s.supportHours),
    grievanceOfficer: s.grievanceName ? { name: s.grievanceName, email: v(s.grievanceEmail) } : undefined,
  };
}

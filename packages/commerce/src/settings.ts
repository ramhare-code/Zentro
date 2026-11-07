// Store settings: the one row in shop.store_settings, with each empty value
// falling back to the environment so existing deployments keep working.
import type { Sql, TransactionSql } from "./db";

export interface StoreSettings {
  businessName: string; legalName: string | null; address: string | null; gstin: string | null; stateCode: string | null;
  supportEmail: string | null; supportPhone: string | null; supportHours: string | null;
  grievanceName: string | null; grievanceEmail: string | null; returnWindowDays: number;
  shippingGstMode: "none" | "highest_item_rate";
}

type Row = { [K in keyof StoreSettings]: StoreSettings[K] | null };

export async function loadStoreSettings(sql: Sql | TransactionSql, env: NodeJS.ProcessEnv = process.env): Promise<StoreSettings> {
  const [r] = await sql<Row[]>`
    select business_name as "businessName", legal_name as "legalName", address, gstin, state_code as "stateCode",
           support_email as "supportEmail", support_phone as "supportPhone", support_hours as "supportHours",
           grievance_name as "grievanceName", grievance_email as "grievanceEmail", return_window_days as "returnWindowDays",
           shipping_gst_mode as "shippingGstMode"
    from shop.store_settings where id`;
  const e = (k: string) => env[k]?.trim() || null;
  return {
    businessName: r?.businessName ?? e("NEXT_PUBLIC_BUSINESS_NAME") ?? "Zentro",
    legalName: r?.legalName ?? e("BUSINESS_LEGAL_NAME"), address: r?.address ?? e("BUSINESS_ADDRESS"),
    gstin: r?.gstin ?? e("BUSINESS_GSTIN"), stateCode: r?.stateCode ?? e("SELLER_STATE_CODE"),
    supportEmail: r?.supportEmail ?? e("SUPPORT_EMAIL"), supportPhone: r?.supportPhone ?? e("SUPPORT_PHONE"), supportHours: r?.supportHours ?? e("SUPPORT_HOURS"),
    grievanceName: r?.grievanceName ?? e("GRIEVANCE_OFFICER_NAME"), grievanceEmail: r?.grievanceEmail ?? e("GRIEVANCE_OFFICER_EMAIL"),
    returnWindowDays: r?.returnWindowDays ?? (Number(e("RETURN_WINDOW_DAYS")) || 7),
    shippingGstMode: r?.shippingGstMode ?? "none",
  };
}

/** What a printed invoice needs, frozen at the moment of issue. */
export function sellerSnapshot(s: StoreSettings) {
  return { name: s.businessName, legalName: s.legalName, address: s.address, gstin: s.gstin, stateCode: s.stateCode, supportEmail: s.supportEmail };
}

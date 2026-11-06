import "server-only";
import type { ProviderEnv } from "@zentro/commerce/messaging";

/** Provider credentials come only from environment variables (never the database or the UI). */
export function providerEnv(): ProviderEnv {
  const e = process.env;
  return {
    STOREFRONT_URL: e.STOREFRONT_URL, NEXT_PUBLIC_BUSINESS_NAME: e.NEXT_PUBLIC_BUSINESS_NAME, UNSUBSCRIBE_SECRET: e.UNSUBSCRIBE_SECRET,
    RESEND_API_KEY: e.RESEND_API_KEY, EMAIL_FROM: e.EMAIL_FROM, RESEND_API_BASE: e.RESEND_API_BASE,
    MSG91_AUTH_KEY: e.MSG91_AUTH_KEY, MSG91_API_BASE: e.MSG91_API_BASE,
    WHATSAPP_PHONE_NUMBER_ID: e.WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN: e.WHATSAPP_ACCESS_TOKEN, WHATSAPP_API_BASE: e.WHATSAPP_API_BASE,
  };
}

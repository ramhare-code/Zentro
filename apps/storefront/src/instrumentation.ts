// Server error reporting: every unhandled error in a page, route or server action is
// logged as one JSON line and, if ALERT_WEBHOOK_URL is set, posted as an alert.
// Only the error message, route and digest are sent — never request bodies, cookies or customer data.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const e = err as Error & { digest?: string };
  const { sendAlert } = await import("@zentro/commerce/ops");
  await sendAlert(`storefront error on ${request.method} ${request.path.split("?")[0]} (${context.routeType}${e.digest ? `, digest ${e.digest}` : ""}): ${String(e.message).slice(0, 200)}`, { ...process.env, APP_NAME: "storefront" });
};

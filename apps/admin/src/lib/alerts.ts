import "server-only";
import { db } from "./db";
import type { StaffSession } from "./session";

export interface Alert {
  key: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  count: number;
}

/** Live operational alerts, computed from current data and filtered by permission. */
export async function getAlerts(s: StaffSession): Promise<Alert[]> {
  const [r] = await db()<{
    outOfStock: number; lowStock: number; stalePayments: number; oldTickets: number;
    failedMessages: number; webhookErrors: number; failedLogins: number; overduePos: number; courierProblems: number; newProblems: number;
  }[]>`
    select
      (select count(*)::int from shop.product_variants v join shop.products p on p.id = v.product_id
        where p.is_active and p.archived_at is null and v.is_active and v.stock = 0) as "outOfStock",
      (select count(*)::int from shop.product_variants v join shop.products p on p.id = v.product_id
        where p.is_active and p.archived_at is null and v.is_active and v.stock > 0 and v.stock <= v.low_stock_threshold) as "lowStock",
      (select count(*)::int from shop.orders where status = 'pending_payment' and reservation_expires_at < now()) as "stalePayments",
      (select count(*)::int from shop.support_tickets where status in ('open','in_progress') and created_at < now() - interval '24 hours') as "oldTickets",
      (select count(*)::int from shop.notification_outbox where status = 'failed') as "failedMessages",
      (select count(*)::int from shop.payment_webhook_events where error is not null and processed_at is null) as "webhookErrors",
      (select count(*)::int from shop.audit_log where action = 'auth.login_failed' and occurred_at > now() - interval '24 hours') as "failedLogins",
      (select count(*)::int from shop.purchase_orders where status in ('ordered','partially_received') and expected_date < (now() at time zone 'Asia/Kolkata')::date) as "overduePos",
      (select count(*)::int from shop.shipments where delivered_at is null and status in ('failed_attempt', 'returned_to_origin') and created_at > now() - interval '30 days') as "courierProblems",
      (select count(*)::int from shop.site_feedback where status = 'new' and kind = 'problem') as "newProblems"`;
  if (!r) return [];
  const has = (p: Parameters<StaffSession["permissions"]["has"]>[0]) => s.permissions.has(p);
  const alerts: Alert[] = [];
  if (has("inventory.read") && r.outOfStock) alerts.push({ key: "oos", severity: "critical", title: "Out of stock", detail: `${r.outOfStock} variant(s) cannot be bought`, href: "/inventory?filter=out", count: r.outOfStock });
  if (has("inventory.read") && r.lowStock) alerts.push({ key: "low", severity: "warning", title: "Low stock", detail: `${r.lowStock} variant(s) at or below threshold`, href: "/inventory?filter=low", count: r.lowStock });
  if (has("support.manage") && r.newProblems) alerts.push({ key: "feedback", severity: "info", title: "Website problems reported", detail: `${r.newProblems} new problem report(s) from visitors`, href: "/support/feedback?kind=problem", count: r.newProblems });
  if (has("orders.read") && r.courierProblems) alerts.push({ key: "courier", severity: "warning", title: "Delivery problems", detail: `${r.courierProblems} shipment(s) failed delivery or are returning to you`, href: "/orders?status=shipped", count: r.courierProblems });
  if (has("purchase_orders.manage") && r.overduePos) alerts.push({ key: "po", severity: "warning", title: "Overdue purchase orders", detail: `${r.overduePos} delivery(ies) past the expected date`, href: "/purchase-orders?status=open", count: r.overduePos });
  if (has("payments.read") && r.webhookErrors) alerts.push({ key: "webhook", severity: "critical", title: "Payment webhook errors", detail: `${r.webhookErrors} gateway event(s) failed to process`, href: "/payments", count: r.webhookErrors });
  if (has("orders.read") && r.stalePayments) alerts.push({ key: "stale", severity: "warning", title: "Expired payment holds", detail: `${r.stalePayments} unpaid order(s) past reservation time`, href: "/orders?status=pending_payment", count: r.stalePayments });
  if (has("support.manage") && r.oldTickets) alerts.push({ key: "tickets", severity: "warning", title: "Tickets waiting > 24h", detail: `${r.oldTickets} customer request(s) need a reply`, href: "/support", count: r.oldTickets });
  if (has("notifications.read") && r.failedMessages) alerts.push({ key: "msg", severity: "warning", title: "Failed customer notifications", detail: `${r.failedMessages} email/SMS could not be delivered`, href: "/messages/history", count: r.failedMessages });
  if (has("audit.read") && r.failedLogins >= 5) alerts.push({ key: "login", severity: "info", title: "Failed admin sign-ins", detail: `${r.failedLogins} in the last 24 hours`, href: "/audit-logs?action=auth.login_failed", count: r.failedLogins });
  return alerts;
}

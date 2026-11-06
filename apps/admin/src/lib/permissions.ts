/** Every permission the admin understands. Roles may only contain these keys. */
export const PERMISSION_GROUPS = [
  { group: "Overview", items: [
    ["dashboard.view", "View dashboard"],
    ["notifications.read", "View operational alerts"],
    ["analytics.read", "View analytics"],
    ["reports.export", "Export reports"],
  ] },
  { group: "Catalogue", items: [
    ["products.read", "View products"],
    ["products.write", "Create and edit products"],
    ["products.publish", "Publish / unpublish products"],
    ["products.archive", "Archive products"],
    ["catalog.manage", "Manage categories and brands"],
  ] },
  { group: "Inventory", items: [
    ["inventory.read", "View inventory"],
    ["inventory.adjust", "Adjust stock"],
    ["suppliers.manage", "Manage suppliers"],
    ["purchase_orders.manage", "Manage purchase orders"],
  ] },
  { group: "Orders", items: [
    ["orders.read", "View orders"],
    ["orders.update", "Update order status and fulfilment"],
    ["orders.cancel", "Cancel orders"],
    ["orders.notes", "Add internal order notes"],
  ] },
  { group: "Customers", items: [
    ["customers.read", "View customers (contact details masked)"],
    ["customers.pii", "See unmasked contact details"],
    ["customers.manage", "Restrict accounts, privacy requests"],
    ["support.manage", "Handle support tickets"],
    ["reviews.moderate", "Moderate reviews"],
  ] },
  { group: "Finance", items: [
    ["payments.read", "View payments"],
    ["payments.reconcile", "Check payments with the gateway, retry webhooks, import settlements"],
    ["refunds.create", "Issue refunds"],
    ["finance.read", "View financial reports"],
    ["finance.export", "Export financial data"],
    ["tax.manage", "Manage tax rules"],
  ] },
  { group: "Marketing", items: [["marketing.manage", "Coupons, promotions, banners and content"]] },
  { group: "Customer messaging", items: [
    ["messages.read", "View message history and analytics"],
    ["messages.send", "Send individual service messages"],
    ["messages.campaigns", "Create and schedule promotional campaigns"],
    ["messages.approve", "Approve large campaigns before sending"],
    ["messages.templates", "Manage message templates"],
    ["messages.consent", "View and manage marketing consent"],
    ["messages.settings", "Configure messaging providers"],
  ] },
  { group: "Administration", items: [
    ["staff.manage", "Invite and manage staff"],
    ["roles.manage", "Manage roles and permissions"],
    ["audit.read", "View audit logs"],
    ["settings.manage", "Change store settings"],
  ] },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["items"][number][0];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map(([k]) => k as Permission));

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/** Permissions that only the Owner role may hold, so nobody can escalate past the owner. */
export const OWNER_ONLY: readonly Permission[] = ["roles.manage", "settings.manage", "staff.manage", "messages.settings"];

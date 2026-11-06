import type { Permission } from "./permissions";

export interface NavItem {
  href: string;
  label: string;
  permission: Permission;
  /** Build phase in which the page becomes functional. 1 = available now. */
  phase: number;
  icon: string;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", permission: "dashboard.view", phase: 1, icon: "home" },
    { href: "/analytics", label: "Visitors & analytics", permission: "analytics.read", phase: 1, icon: "chart" },
    { href: "/notifications", label: "Alerts", permission: "notifications.read", phase: 1, icon: "bell" },
  ] },
  { section: "Catalogue", items: [
    { href: "/products", label: "Products", permission: "products.read", phase: 1, icon: "box" },
    { href: "/categories", label: "Categories", permission: "catalog.manage", phase: 1, icon: "folder" },
    { href: "/brands", label: "Brands", permission: "catalog.manage", phase: 1, icon: "tag" },
  ] },
  { section: "Inventory", items: [
    { href: "/inventory", label: "Inventory", permission: "inventory.read", phase: 1, icon: "layers" },
    { href: "/suppliers", label: "Suppliers", permission: "suppliers.manage", phase: 1, icon: "truck" },
    { href: "/purchase-orders", label: "Purchase orders", permission: "purchase_orders.manage", phase: 1, icon: "clipboard" },
  ] },
  { section: "Sales", items: [
    { href: "/orders", label: "Orders", permission: "orders.read", phase: 1, icon: "cart" },
    { href: "/payments", label: "Payments", permission: "payments.read", phase: 4, icon: "card" },
    { href: "/refunds", label: "Refunds", permission: "refunds.create", phase: 1, icon: "undo" },
    { href: "/finance", label: "Finance", permission: "finance.read", phase: 6, icon: "rupee" },
  ] },
  { section: "Customers", items: [
    { href: "/customers", label: "Customers", permission: "customers.read", phase: 1, icon: "users" },
    { href: "/support", label: "Support", permission: "support.manage", phase: 1, icon: "headset" },
    { href: "/reviews", label: "Reviews", permission: "reviews.moderate", phase: 1, icon: "star" },
    { href: "/messages", label: "Messaging", permission: "messages.read", phase: 1, icon: "message" },
  ] },
  { section: "Marketing", items: [
    { href: "/coupons", label: "Coupons", permission: "marketing.manage", phase: 5, icon: "ticket" },
    { href: "/promotions", label: "Promotions", permission: "marketing.manage", phase: 5, icon: "spark" },
    { href: "/banners", label: "Banners", permission: "marketing.manage", phase: 5, icon: "image" },
  ] },
  { section: "Administration", items: [
    { href: "/staff", label: "Staff", permission: "staff.manage", phase: 1, icon: "badge" },
    { href: "/roles", label: "Roles", permission: "roles.manage", phase: 1, icon: "shield" },
    { href: "/audit-logs", label: "Audit log", permission: "audit.read", phase: 1, icon: "list" },
    { href: "/settings", label: "Settings", permission: "settings.manage", phase: 7, icon: "cog" },
  ] },
];

export const PHASE_NAMES: Record<number, string> = {
  2: "Catalogue", 3: "Inventory", 4: "Commerce operations", 5: "Customers & marketing", 6: "Analytics", 7: "Security & deployment",
};

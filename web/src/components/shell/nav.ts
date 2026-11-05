import type { Permission } from "@/contracts/permissions";
import type { Messages } from "@/lib/i18n/messages";

export interface NavItem {
  label: string;
  /** Path under /halls/[hallId]. Empty string is the overview. */
  path: string;
  /** Permission needed to SEE the item. UX only; the server enforces access (spec §21.1). */
  permission?: Permission;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const HALL_NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Overview", path: "", permission: "device.view" },
      { label: "Devices", path: "/devices", permission: "device.view" },
      { label: "Reservations", path: "/reservations", permission: "reservation.view" },
      { label: "Sessions", path: "/sessions", permission: "session.start" },
      { label: "Products", path: "/products", permission: "product.sell" },
      { label: "Agents", path: "/agents", permission: "device.view" },
      { label: "Commands", path: "/commands", permission: "device.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", path: "/invoices", permission: "invoice.view" },
      { label: "Wallets", path: "/wallets", permission: "wallet.view" },
      { label: "Refunds", path: "/refunds", permission: "refund.request" },
      { label: "Adjustments", path: "/adjustments", permission: "payment.adjust" },
      { label: "Expenses", path: "/expenses", permission: "expense.manage" },
      { label: "Shifts", path: "/shifts", permission: "shift.open" },
      { label: "Registers", path: "/registers", permission: "shift.close" },
      { label: "Reports", path: "/reports", permission: "report.financial.view" },
    ],
  },
  {
    label: "Account",
    items: [{ label: "My activity", path: "/my-activity" }],
  },
  {
    label: "Management",
    items: [
      { label: "Pricing", path: "/pricing", permission: "hall.settings.manage" },
      { label: "Packages", path: "/packages", permission: "package.manage" },
      { label: "Discounts", path: "/discounts", permission: "discount.manage" },
      { label: "Employees", path: "/employees", permission: "employee.manage" },
      { label: "Settings", path: "/settings", permission: "hall.settings.manage" },
      { label: "Audit log", path: "/audit", permission: "hall.settings.manage" },
    ],
  },
];

/**
 * Single source of truth for which permission a hall route needs. Pages call this in their
 * server guard so navigation and enforcement cannot drift apart.
 */
export function permissionForPath(path: string): Permission {
  for (const group of HALL_NAV) {
    const item = group.items.find((i) => i.path === path);
    if (item?.permission) return item.permission;
  }
  throw new Error(`No permission registered for hall route "${path}"`);
}

/** Returns only the groups/items the user may see; drops empty groups. */
export function filterNav(groups: NavGroup[], granted: readonly Permission[]): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.permission || granted.includes(i.permission)),
    }))
    .filter((g) => g.items.length > 0);
}

/** Dictionary key for each nav label and group label. Labels remain the stable identifiers. */
export const NAV_KEYS: Record<string, keyof Messages> = {
  Operations: "navOperations",
  Finance: "navFinance",
  Account: "navAccount",
  Management: "navManagement",
  Overview: "navOverview",
  Devices: "navDevices",
  Reservations: "navReservations",
  Sessions: "navSessions",
  Products: "navProducts",
  Agents: "navAgents",
  Commands: "navCommands",
  Invoices: "navInvoices",
  Wallets: "navWallets",
  Refunds: "navRefunds",
  Adjustments: "navAdjustments",
  Expenses: "navExpenses",
  Shifts: "navShifts",
  Registers: "navRegisters",
  Reports: "navReports",
  Pricing: "navPricing",
  Packages: "navPackages",
  Discounts: "navDiscounts",
  Employees: "navEmployees",
  Settings: "navSettings",
  "Audit log": "navAudit",
  "My activity": "navMyActivity",
};

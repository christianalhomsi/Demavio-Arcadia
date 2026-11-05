/**
 * Permission identifiers from spec §4.7. The list is ILLUSTRATIVE: the final role/permission
 * matrix is pending approval (DEC-01). Keep in sync with the backend `permissions` seed.
 */
export const PERMISSIONS = [
  "reservation.view",
  "reservation.create",
  "reservation.cancel",
  "reservation.confirm",
  "reservation.check_in",
  "reservation.override_late",
  "product.manage",
  "product.sell",
  "package.manage",
  "expense.manage",
  "discount.manage",
  "discount.apply",
  "session.start",
  "session.end",
  "session.extend",
  "device.view",
  "device.control",
  "invoice.view",
  "payment.collect",
  "payment.adjust",
  "refund.request",
  "refund.approve",
  "wallet.view",
  "wallet.top_up",
  "wallet.withdraw",
  "shift.open",
  "shift.close",
  "report.financial.view",
  "employee.manage",
  "hall.settings.manage",
  "platform.tenants.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function hasPermission(granted: readonly Permission[], needed: Permission): boolean {
  return granted.includes(needed);
}

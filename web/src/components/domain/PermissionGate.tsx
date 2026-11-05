"use client";

import * as React from "react";
import type { Permission } from "@/contracts/permissions";

const PermissionContext = React.createContext<readonly Permission[]>([]);

/** Supplies the current hall's permissions to client components (set by the hall layout). */
export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: readonly Permission[];
  children: React.ReactNode;
}) {
  return <PermissionContext.Provider value={permissions}>{children}</PermissionContext.Provider>;
}

export function useCan(permission: Permission): boolean {
  return React.useContext(PermissionContext).includes(permission);
}

/**
 * Shows children only when the user holds the permission.
 * UX ONLY: hiding a control never protects anything. Server Actions and RPCs enforce access.
 */
export function PermissionGate({
  permission,
  fallback = null,
  children,
}: {
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  return useCan(permission) ? <>{children}</> : <>{fallback}</>;
}

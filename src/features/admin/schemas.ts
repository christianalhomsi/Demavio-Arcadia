import type { Messages } from "@/lib/i18n/messages";

export const ROLE_KEYS: Record<string, keyof Messages> = {
  super_admin: "roleSuper",
  sales_admin: "roleSalesAdmin",
  sales_agent: "roleSalesAgent",
};

/** Dictionary key of each platform audit filter, by its value. */
export const AUDIT_FILTER_KEYS: Record<string, keyof Messages> = {
  "": "auAll",
  "admin.hall": "plAuHalls",
  "admin.role": "plAuRoles",
  "admin.user": "plAuUsers",
  "sales.": "plAuSales",
};

export const PLATFORM_ROLES = [
  { value: "super_admin", label: "Super admin" },
  { value: "sales_admin", label: "Sales admin" },
  { value: "sales_agent", label: "Sales agent" },
] as const;

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  PLATFORM_ROLES.map((r) => [r.value, r.label]),
);

/** Platform audit filters (only known prefixes reach the backend). */
export const PLATFORM_AUDIT_FILTERS = [
  { value: "", label: "All activity" },
  { value: "admin.hall", label: "Halls" },
  { value: "admin.role", label: "Roles" },
  { value: "admin.user", label: "Users" },
  { value: "sales.", label: "Sales" },
] as const;

/** Every hall is in Syria: the time zone is fixed and the currency is one of these two. */
export const HALL_TIME_ZONE = "Asia/Damascus";
export const HALL_CURRENCIES = ["SYP", "USD"] as const;

/** Subscription periods are a fixed list, not typed text. */
export const PLAN_PERIODS = ["monthly", "quarterly", "semiannual", "annual"] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];
export const PLAN_PERIOD_KEYS: Record<PlanPeriod, keyof Messages> = {
  monthly: "spPerMonthly",
  quarterly: "spPerQuarterly",
  semiannual: "spPerSemiannual",
  annual: "spPerAnnual",
};

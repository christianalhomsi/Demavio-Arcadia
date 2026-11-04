import type { Messages } from "@/lib/i18n/messages";
import { PLAN_PERIOD_KEYS, type PlanPeriod } from "./schemas";

/** "Monthly" or "Monthly · Pro": the fixed period, then the optional name that tells same-period plans apart. */
export function planLabel(t: Messages, period: string | null, name: string): string {
  const key = period ? PLAN_PERIOD_KEYS[period as PlanPeriod] : undefined;
  const base = key ? t[key] : "";
  return [base, name.trim()].filter(Boolean).join(" · ");
}

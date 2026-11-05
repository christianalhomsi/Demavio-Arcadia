import type { Messages } from "@/lib/i18n/messages";

export const REFUND_REASON_KEYS: Record<string, keyof Messages> = {
  customer_request: "rfrCustomer",
  overcharge: "rfrOvercharge",
  service_issue: "rfrService",
  other: "rfrOtherNote",
};

export const REFUND_REASONS = [
  { value: "customer_request", label: "Customer request" },
  { value: "overcharge", label: "Overcharge" },
  { value: "service_issue", label: "Service issue" },
  { value: "other", label: "Other (note required)" },
] as const;

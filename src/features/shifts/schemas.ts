import type { Messages } from "@/lib/i18n/messages";

/** Dictionary keys for the labels below (the English labels stay as fallbacks). */
export const MOVEMENT_KIND_KEYS: Record<string, keyof Messages> = {
  payout: "mvkPayout",
  adjustment_in: "mvkAdjIn",
  adjustment_out: "mvkAdjOut",
};

export const MOVEMENT_LABEL_KEYS: Record<string, keyof Messages> = {
  cash_payment: "mvCashPayment",
  wallet_top_up: "mvTopUp",
  cash_refund: "mvCashRefund",
  payout: "mvPayout",
  adjustment_in: "mvAdjIn",
  adjustment_out: "mvAdjOut",
};

export const MOVEMENT_KINDS = [
  { value: "payout", label: "Payout (cash taken out)" },
  { value: "adjustment_in", label: "Adjustment: cash added" },
  { value: "adjustment_out", label: "Adjustment: cash removed" },
] as const;

export type ManualMovementKind = (typeof MOVEMENT_KINDS)[number]["value"];

export const MOVEMENT_LABELS: Record<string, string> = {
  cash_payment: "Cash payment",
  wallet_top_up: "Wallet top-up (stored value)",
  cash_refund: "Cash refund",
  payout: "Payout",
  adjustment_in: "Adjustment (in)",
  adjustment_out: "Adjustment (out)",
};

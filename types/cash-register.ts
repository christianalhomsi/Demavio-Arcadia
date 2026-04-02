export type CashRegisterStatus = "open" | "closed";

export type CashRegister = {
  id: string;
  hall_id: string;
  opened_by: string;
  opening_balance: number;
  status: CashRegisterStatus;
  opened_at: string;
  closed_at: string | null;
};

export type OpenCashRegisterInput = {
  hall_id: string;
  opened_by: string;
  opening_balance: number;
};

export type CloseCashRegisterInput = {
  register_id: string;
  closed_by: string;
  actual_balance: number;
  total_income: number;
  total_outflows: number;
};

export type CashRegisterSummary = CashRegister & {
  closed_by: string;
  actual_balance: number;
  expected_balance: number;
  variance: number;
};

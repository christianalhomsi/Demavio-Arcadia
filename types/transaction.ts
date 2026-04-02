export type TransactionType =
  | "session_income"
  | "expense"
  | "refund"
  | "adjustment";

export type FinancialTransaction = {
  id: string;
  type: TransactionType;
  amount: number;
  reference_id: string | null;
  reference_type: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};

export type InsertTransactionInput = {
  type: TransactionType;
  amount: number;
  created_by: string;
  reference_id?: string;
  reference_type?: string;
  note?: string;
};

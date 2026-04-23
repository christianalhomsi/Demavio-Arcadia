export type PlayerWallet = {
  id: string;
  hall_id: string;
  user_id: string | null;
  guest_name: string | null;
  created_at: string;
  updated_at: string;
};

export type WalletTransaction = {
  id: string;
  wallet_id: string;
  amount: number;
  type: 'top_up' | 'deduction' | 'refund';
  session_id: string | null;
  added_by: string | null;
  note: string | null;
  created_at: string;
};

export type WalletWithBalance = PlayerWallet & {
  balance: number;
};

export type WalletTopUpInput = {
  hall_id: string;
  user_id?: string | null;
  guest_name?: string | null;
  amount: number;
  note?: string;
};

export type Invoice = {
  id: string;
  session_id: string;
  payment_id: string;
  hall_id: string;
  device_id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string;
  duration_hours: number;
  rate_per_hour: number;
  session_price: number;
  items: InvoiceItem[];
  items_total: number;
  total_price: number;
  payment_method: 'cash' | 'wallet';
  wallet_transaction_id: string | null;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
};

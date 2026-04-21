export type SessionItem = {
  id: string;
  session_id: string;
  product_id: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
  created_at: string;
};

export type SessionItemInput = {
  session_id: string;
  product_id?: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
};

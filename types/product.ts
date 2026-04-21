export type Product = {
  id: string;
  hall_id: string;
  name: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  name: string;
  price: number;
  is_active?: boolean;
};

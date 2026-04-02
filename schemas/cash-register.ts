import { z } from "zod";

export const openCashRegisterSchema = z.object({
  hall_id: z.string().uuid(),
  opening_balance: z.number().min(0),
});

export type OpenCashRegisterFormInput = z.infer<typeof openCashRegisterSchema>;

export const closeCashRegisterSchema = z.object({
  actual_balance: z.number().min(0),
  total_income: z.number().min(0),
  total_outflows: z.number().min(0),
});

export type CloseCashRegisterFormInput = z.infer<typeof closeCashRegisterSchema>;

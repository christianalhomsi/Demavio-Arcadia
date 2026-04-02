export type Reservation = {
  id: string;
  device_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
};

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

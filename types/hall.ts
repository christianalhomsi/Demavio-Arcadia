export type WorkingHours = {
  day: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  open_time: string; // HH:MM format
  close_time: string; // HH:MM format
  is_open: boolean;
};

export type Hall = {
  id: string;
  name: string;
  address: string | null;
  working_hours: WorkingHours[] | null;
  created_at: string;
};

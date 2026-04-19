export type DeviceType = {
  id: string;
  name: string;
  name_ar: string;
  name_en: string;
  created_at: string;
};

export type HallDevice = {
  id: string;
  hall_id: string;
  device_type_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  device_type?: DeviceType;
};

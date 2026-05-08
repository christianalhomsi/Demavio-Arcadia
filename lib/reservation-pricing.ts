import { getAdminClient } from "./supabase/admin";

type PricingResult = {
  price_per_hour: number;
  is_time_based: boolean;
};

/**
 * حساب السعر بناءً على نوع الجهاز، الوقت، وعدد اللاعبين
 */
export async function calculateReservationPrice(
  hallId: string,
  deviceTypeId: string,
  startTime: Date,
  playersCount: number = 2
): Promise<PricingResult> {
  const supabase = getAdminClient();
  
  const timeStr = startTime.toTimeString().slice(0, 5); // HH:MM

  // جلب الأسعار حسب الوقت
  const { data: timePricing } = await supabase
    .from("device_time_pricing")
    .select("*")
    .eq("hall_id", hallId)
    .eq("device_type_id", deviceTypeId)
    .lte("start_time", timeStr)
    .gte("end_time", timeStr)
    .single();

  if (timePricing) {
    // إذا كان الجهاز يدعم سعرين (ثنائي ورباعي)
    const price = playersCount === 4 
      ? (timePricing.price_quad || timePricing.price_per_hour)
      : (timePricing.price_dual || timePricing.price_per_hour);
    
    return {
      price_per_hour: price,
      is_time_based: true,
    };
  }

  // إذا لم يوجد سعر حسب الوقت، استخدم السعر الافتراضي
  const { data: hallDevice } = await supabase
    .from("hall_devices")
    .select("price_per_hour, dual_price, quad_price")
    .eq("hall_id", hallId)
    .eq("device_type_id", deviceTypeId)
    .single();

  if (hallDevice) {
    let price = hallDevice.price_per_hour;
    
    // إذا كان الجهاز يدعم سعرين
    if (hallDevice.dual_price || hallDevice.quad_price) {
      price = playersCount === 4 
        ? (hallDevice.quad_price || hallDevice.price_per_hour)
        : (hallDevice.dual_price || hallDevice.price_per_hour);
    }

    return {
      price_per_hour: price,
      is_time_based: false,
    };
  }

  return {
    price_per_hour: 0,
    is_time_based: false,
  };
}

/**
 * حساب السعر الإجمالي للحجز
 */
export function calculateTotalPrice(
  pricePerHour: number,
  startTime: Date,
  endTime: Date
): number {
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  return Math.round(durationHours * pricePerHour * 100) / 100;
}

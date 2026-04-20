import { getServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { DeviceType, HallDevice } from "@/types/device-type";

export async function getDeviceTypes(): Promise<DeviceType[]> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("device_types")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getHallDevices(hallId: string): Promise<HallDevice[]> {
  // استخدم admin client لتجاوز RLS
  const supabase = getAdminClient();
  
  console.log("🔍 Fetching hall_devices for hallId:", hallId);
  
  // جلب من hall_devices
  const { data: hallDevicesData, error } = await supabase
    .from("hall_devices")
    .select("*")
    .eq("hall_id", hallId);

  console.log("📦 hall_devices result:", { data: hallDevicesData, error });

  if (error) {
    console.error("❌ Error fetching hall_devices:", error);
    throw new Error(error.message);
  }
  
  // إذا hall_devices فارغ، جرب تملأه من devices الموجودة
  if (!hallDevicesData || hallDevicesData.length === 0) {
    const { data: devicesData } = await supabase
      .from("devices")
      .select("device_type_id")
      .eq("hall_id", hallId);
    
    if (devicesData && devicesData.length > 0) {
      // احسب الكمية لكل نوع
      const typeCounts = new Map<string, number>();
      devicesData.forEach(d => {
        typeCounts.set(d.device_type_id, (typeCounts.get(d.device_type_id) || 0) + 1);
      });
      
      // أضف إلى hall_devices
      const hallDevicesToInsert = Array.from(typeCounts.entries()).map(([typeId, count]) => ({
        hall_id: hallId,
        device_type_id: typeId,
        quantity: count,
        price_per_hour: 0, // سعر افتراضي
      }));
      
      await supabase.from("hall_devices").insert(hallDevicesToInsert);
      
      // جلب البيانات مرة أخرى
      const { data: newData } = await supabase
        .from("hall_devices")
        .select("*")
        .eq("hall_id", hallId);
      
      return newData || [];
    }
  }
  
  return hallDevicesData || [];
}

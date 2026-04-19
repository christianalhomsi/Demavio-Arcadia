import { NextResponse } from "next/server";
import { assertSuperAdmin } from "@/lib/admin-auth";
import { getServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  name:         z.string().min(1),
  address:      z.string().nullable().optional(),
  devices: z.array(z.object({
    device_type_id: z.string().uuid(),
    quantity: z.coerce.number().int().min(0),
  })).optional(),
  working_hours: z.array(z.object({
    day: z.number().int().min(0).max(6),
    open_time: z.string(),
    close_time: z.string(),
    is_open: z.boolean(),
  })).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ hallId: string }> }) {
  const gate = await assertSuperAdmin();
  if (!gate.ok) return gate.response;

  const { hallId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const supabase = await getServerClient();
  const { error } = await supabase
    .from("halls")
    .update({ 
      name: parsed.data.name, 
      address: parsed.data.address ?? null,
      working_hours: parsed.data.working_hours ?? null,
    })
    .eq("id", hallId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // تحديث الأجهزة
  if (parsed.data.devices) {
    const { data: currentHallDevices } = await supabase
      .from("hall_devices")
      .select("*")
      .eq("hall_id", hallId);

    const currentMap = new Map((currentHallDevices || []).map(hd => [hd.device_type_id, hd]));

    // جلب أسماء أنواع الأجهزة
    const { data: deviceTypesData } = await supabase
      .from("device_types")
      .select("id, name_en")
      .in("id", parsed.data.devices.map(d => d.device_type_id));
    
    const typeNamesMap = new Map((deviceTypesData || []).map(dt => [dt.id, dt.name_en]));

    for (const deviceGroup of parsed.data.devices) {
      const current = currentMap.get(deviceGroup.device_type_id);
      const targetQty = deviceGroup.quantity;
      const typeName = typeNamesMap.get(deviceGroup.device_type_id) || "Device";

      if (!current) {
        // إضافة نوع جديد
        if (targetQty > 0) {
          const newDevices = Array.from({ length: targetQty }, (_, i) => ({
            hall_id: hallId,
            name: `${typeName} ${i + 1}`,
            status: "available" as const,
            device_type_id: deviceGroup.device_type_id,
          }));
          await supabase.from("devices").insert(newDevices);
          await supabase.from("hall_devices").insert({
            hall_id: hallId,
            device_type_id: deviceGroup.device_type_id,
            quantity: targetQty,
          });
        }
      } else {
        const currentQty = current.quantity;
        const diff = targetQty - currentQty;

        if (diff > 0) {
          // إضافة أجهزة
          const newDevices = Array.from({ length: diff }, (_, i) => ({
            hall_id: hallId,
            name: `${typeName} ${currentQty + i + 1}`,
            status: "available" as const,
            device_type_id: deviceGroup.device_type_id,
          }));
          await supabase.from("devices").insert(newDevices);
          await supabase.from("hall_devices")
            .update({ quantity: targetQty, updated_at: new Date().toISOString() })
            .eq("id", current.id);
        } else if (diff < 0) {
          // حذف أجهزة متاحة فقط
          const { data: devicesToRemove } = await supabase
            .from("devices")
            .select("id")
            .eq("hall_id", hallId)
            .eq("device_type_id", deviceGroup.device_type_id)
            .eq("status", "available")
            .limit(Math.abs(diff));

          if (devicesToRemove && devicesToRemove.length > 0) {
            await supabase
              .from("devices")
              .delete()
              .in("id", devicesToRemove.map(d => d.id));
          }

          const newQty = currentQty - (devicesToRemove?.length || 0);
          if (newQty === 0) {
            await supabase.from("hall_devices").delete().eq("id", current.id);
          } else {
            await supabase.from("hall_devices")
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq("id", current.id);
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

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
    price_per_hour: z.coerce.number().min(0),
  })).optional(),
  working_hours: z.array(z.object({
    day: z.number().int().min(0).max(6),
    open_time: z.string(),
    close_time: z.string(),
    is_open: z.boolean(),
  })).optional(),
  devices_to_delete: z.array(z.string().uuid()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ hallId: string }> }) {
  const gate = await assertSuperAdmin();
  if (!gate.ok) return gate.response;

  const { hallId } = await params;
  const body = await request.json().catch(() => null);
  
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { error } = await supabase
    .from("halls")
    .update({ 
      name: parsed.data.name, 
      address: parsed.data.address ?? null,
      working_hours: parsed.data.working_hours ?? null,
    })
    .eq("id", hallId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // حذف الأجهزة المحددة أولاً
  if (parsed.data.devices_to_delete && parsed.data.devices_to_delete.length > 0) {
    await supabase.from("devices").delete().in("id", parsed.data.devices_to_delete);
  }

  // تحديث الأجهزة
  if (parsed.data.devices) {
    const requestedTypeIds = parsed.data.devices.map(d => d.device_type_id);
    const requestedTypeIdsSet = new Set(requestedTypeIds);

    const { data: hallDeviceRows, error: hallDeviceRowsError } = await supabase
      .from("hall_devices")
      .select("id, device_type_id")
      .eq("hall_id", hallId);

    if (hallDeviceRowsError) {
      return NextResponse.json({ error: hallDeviceRowsError.message }, { status: 500 });
    }
    const hallDeviceByType = new Map((hallDeviceRows || []).map(row => [row.device_type_id, row.id]));

    // حذف الأنواع التي أزيلت من الفورم بشكل كامل
    for (const row of hallDeviceRows || []) {
      if (!requestedTypeIdsSet.has(row.device_type_id)) {
        const { error: deleteDevicesError } = await supabase
          .from("devices")
          .delete()
          .eq("hall_id", hallId)
          .eq("device_type_id", row.device_type_id);
        if (deleteDevicesError) {
          return NextResponse.json({ error: deleteDevicesError.message }, { status: 500 });
        }

        const { error: deleteHallDeviceError } = await supabase
          .from("hall_devices")
          .delete()
          .eq("id", row.id);
        if (deleteHallDeviceError) {
          return NextResponse.json({ error: deleteHallDeviceError.message }, { status: 500 });
        }
      }
    }

    const { data: deviceTypesData, error: deviceTypesError } = await supabase
      .from("device_types")
      .select("id, name_en")
      .in("id", requestedTypeIds);

    if (deviceTypesError) {
      return NextResponse.json({ error: deviceTypesError.message }, { status: 500 });
    }

    const typeNamesMap = new Map((deviceTypesData || []).map(dt => [dt.id, dt.name_en]));

    for (const deviceGroup of parsed.data.devices) {
      const targetQty = deviceGroup.quantity;
      const typeName = typeNamesMap.get(deviceGroup.device_type_id) || "Device";

      const { data: existingBefore, error: existingBeforeError } = await supabase
        .from("devices")
        .select("id, status")
        .eq("hall_id", hallId)
        .eq("device_type_id", deviceGroup.device_type_id)
        .order("id", { ascending: true });

      if (existingBeforeError) {
        return NextResponse.json({ error: existingBeforeError.message }, { status: 500 });
      }

      const currentQty = existingBefore?.length || 0;
      const diff = targetQty - currentQty;

      if (diff > 0) {
        const newDevices = Array.from({ length: diff }, () => ({
          hall_id: hallId,
          name: `${typeName} pending`,
          status: "available" as const,
          device_type_id: deviceGroup.device_type_id,
        }));

        const { error: insertError } = await supabase.from("devices").insert(newDevices);
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      } else if (diff < 0) {
        const removable = (existingBefore || [])
          .filter(d => d.status === "available")
          .slice(-Math.abs(diff));

        if (removable.length > 0) {
          const { error: removeError } = await supabase
            .from("devices")
            .delete()
            .in("id", removable.map(d => d.id));
          if (removeError) {
            return NextResponse.json({ error: removeError.message }, { status: 500 });
          }
        }
      }

      const { data: existingAfter, error: existingAfterError } = await supabase
        .from("devices")
        .select("id")
        .eq("hall_id", hallId)
        .eq("device_type_id", deviceGroup.device_type_id)
        .order("id", { ascending: true });

      if (existingAfterError) {
        return NextResponse.json({ error: existingAfterError.message }, { status: 500 });
      }

      if (existingAfter) {
        for (let i = 0; i < existingAfter.length; i++) {
          const { error: renameError } = await supabase
            .from("devices")
            .update({ name: `${typeName} ${i + 1}` })
            .eq("id", existingAfter[i].id);
          if (renameError) {
            return NextResponse.json({ error: renameError.message }, { status: 500 });
          }
        }
      }

      const finalQty = existingAfter?.length || 0;

      if (finalQty === 0) {
        const { error: deleteHallDeviceError } = await supabase
          .from("hall_devices")
          .delete()
          .eq("hall_id", hallId)
          .eq("device_type_id", deviceGroup.device_type_id);
        if (deleteHallDeviceError) {
          return NextResponse.json({ error: deleteHallDeviceError.message }, { status: 500 });
        }
        hallDeviceByType.delete(deviceGroup.device_type_id);
      } else {
        const existingHallDeviceId = hallDeviceByType.get(deviceGroup.device_type_id);
        const hallDevicePayload = {
          hall_id: hallId,
          device_type_id: deviceGroup.device_type_id,
          quantity: finalQty,
          price_per_hour: deviceGroup.price_per_hour || 0,
          updated_at: new Date().toISOString(),
        };

        if (existingHallDeviceId) {
          const { error: updateHallDeviceError } = await supabase
            .from("hall_devices")
            .update(hallDevicePayload)
            .eq("id", existingHallDeviceId);
          if (updateHallDeviceError) {
            return NextResponse.json({ error: updateHallDeviceError.message }, { status: 500 });
          }
        } else {
          const { data: insertedHallDevice, error: insertHallDeviceError } = await supabase
            .from("hall_devices")
            .insert(hallDevicePayload)
            .select("id")
            .single();

          if (insertHallDeviceError) {
            return NextResponse.json({ error: insertHallDeviceError.message }, { status: 500 });
          }

          hallDeviceByType.set(deviceGroup.device_type_id, insertedHallDevice.id);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

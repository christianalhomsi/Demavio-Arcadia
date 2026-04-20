import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hallBootstrapSchema } from "@/schemas/admin-hall";
import { assertSuperAdmin } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase/admin";

async function rollbackHall(admin: SupabaseClient, hallId: string) {
  await admin.from("devices").delete().eq("hall_id", hallId);
  await admin.from("hall_devices").delete().eq("hall_id", hallId);
  await admin.from("staff_assignments").delete().eq("hall_id", hallId);
  await admin.from("staff_hall_access").delete().eq("hall_id", hallId);
  await admin.from("halls").delete().eq("id", hallId);
}

export async function POST(request: Request) {
  const gate = await assertSuperAdmin();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const parsed = hallBootstrapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, address, devices, staff, extra_staff } = parsed.data;
  const admin = getAdminClient();

  const { data: hallRow, error: hallErr } = await admin
    .from("halls")
    .insert({
      name,
      address: address ?? null,
      working_hours: parsed.data.working_hours ?? null,
    })
    .select("id")
    .single();

  if (hallErr || !hallRow) {
    console.error("[admin/halls/bootstrap] hall insert", hallErr);
    return NextResponse.json({ error: "Failed to create hall" }, { status: 500 });
  }

  const hallId = hallRow.id as string;

  // إنشاء الأجهزة حسب النوع
  const allDevices = [];
  const hallDevicesRecords = [];
  
  // جلب أسماء أنواع الأجهزة
  const { data: deviceTypesData } = await admin
    .from("device_types")
    .select("id, name_en")
    .in("id", devices.map(d => d.device_type_id));
  
  const typeNamesMap = new Map((deviceTypesData || []).map(dt => [dt.id, dt.name_en]));
  
  for (const deviceGroup of devices) {
    const typeName = typeNamesMap.get(deviceGroup.device_type_id) || "Device";
    for (let i = 0; i < deviceGroup.quantity; i++) {
      allDevices.push({
        hall_id: hallId,
        name: `${typeName} ${i + 1}`,
        status: "available" as const,
        device_type_id: deviceGroup.device_type_id,
      });
    }
    
    hallDevicesRecords.push({
      hall_id: hallId,
      device_type_id: deviceGroup.device_type_id,
      quantity: deviceGroup.quantity,
      price_per_hour: deviceGroup.price_per_hour || 0,
    });
  }

  const { error: devErr } = await admin.from("devices").insert(allDevices);
  if (devErr) {
    console.error("[admin/halls/bootstrap] devices insert", devErr);
    await rollbackHall(admin, hallId);
    return NextResponse.json({ error: "Failed to create devices" }, { status: 500 });
  }

  const { error: hallDevErr } = await admin.from("hall_devices").insert(hallDevicesRecords);
  if (hallDevErr) {
    console.error("[admin/halls/bootstrap] hall_devices insert", hallDevErr);
    await rollbackHall(admin, hallId);
    return NextResponse.json({ error: "Failed to create hall devices" }, { status: 500 });
  }

  if (staff) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: staff.email,
      password: staff.password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      await rollbackHall(admin, hallId);
      return NextResponse.json(
        { error: createErr?.message || "Failed to create user" },
        { status: 422 }
      );
    }

    const userId = created.user.id;

    await admin.from("profiles").upsert({ id: userId, email: staff.email, role: "hall_manager" });

    const { error: saErr } = await admin.from("staff_assignments").insert({
      user_id: userId,
      hall_id: hallId,
      role: "hall_manager",
    });

    if (saErr) {
      console.error("[admin/halls/bootstrap] staff_assignments", saErr);
      await rollbackHall(admin, hallId);
      return NextResponse.json(
        { error: saErr.message || "Failed to assign staff" },
        { status: 500 }
      );
    }

    const { error: legacyErr } = await admin.from("staff_hall_access").insert({
      user_id: userId,
      hall_id: hallId,
    });

    if (legacyErr) {
      console.error("[admin/halls/bootstrap] staff_hall_access", legacyErr);
      await rollbackHall(admin, hallId);
      return NextResponse.json(
        { error: legacyErr.message || "Failed to sync legacy staff access" },
        { status: 500 }
      );
    }
  }

  if (extra_staff?.length) {
    for (const member of extra_staff) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: member.email,
        password: member.password,
        email_confirm: true,
      });

      if (createErr || !created?.user) {
        console.error("[admin/halls/bootstrap] extra_staff createUser", createErr);
        await rollbackHall(admin, hallId);
        return NextResponse.json(
          { error: createErr?.message || `Failed to create user ${member.email}` },
          { status: 422 }
        );
      }

      const uid = created.user.id;
      await admin.from("profiles").upsert({ id: uid, email: member.email, role: "hall_staff" });
      await admin.from("staff_assignments").insert({ user_id: uid, hall_id: hallId, role: "hall_staff" });
      await admin.from("staff_hall_access").insert({ user_id: uid, hall_id: hallId });
    }
  }

  return NextResponse.json({ hall_id: hallId }, { status: 201 });
}

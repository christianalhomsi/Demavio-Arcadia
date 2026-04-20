import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  prices: z.record(z.string(), z.coerce.number().min(0)),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ hallId: string }> }
) {
  const { hallId } = await params;
  const supabase = await getServerClient();

  // التحقق من صلاحيات المستخدم
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // التحقق من أن المستخدم manager أو staff في هذه الصالة
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // السماح للـ super_admin بالتعديل
  if (profile.role !== "super_admin") {
    const { data: assignment } = await supabase
      .from("staff_assignments")
      .select("role")
      .eq("user_id", user.id)
      .eq("hall_id", hallId)
      .single();

    if (!assignment || !["hall_manager", "hall_staff"].includes(assignment.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { prices } = parsed.data;

  // تحديث الأسعار
  try {
    for (const [hallDeviceId, price] of Object.entries(prices)) {
      await supabase
        .from("hall_devices")
        .update({ 
          price_per_hour: price,
          updated_at: new Date().toISOString() 
        })
        .eq("id", hallDeviceId)
        .eq("hall_id", hallId); // التأكد من أن الجهاز ينتمي لهذه الصالة
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[dashboard/halls/pricing] update error", error);
    return NextResponse.json(
      { error: "Failed to update prices" },
      { status: 500 }
    );
  }
}

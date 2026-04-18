import { NextResponse } from "next/server";
import { assertSuperAdmin } from "@/lib/admin-auth";
import { getServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  name:         z.string().min(1),
  address:      z.string().nullable().optional(),
  device_count: z.number().int().min(1).optional(),
  device_prefix: z.string().optional(),
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

  // handle device count change
  if (parsed.data.device_count !== undefined) {
    const { data: existing } = await supabase
      .from("devices")
      .select("id")
      .eq("hall_id", hallId)
      .order("name", { ascending: true });

    const currentCount = (existing ?? []).length;
    const target = parsed.data.device_count;
    const prefix = parsed.data.device_prefix ?? "Station";

    if (target > currentCount) {
      // add missing devices
      const toAdd = Array.from({ length: target - currentCount }, (_, i) => ({
        hall_id: hallId,
        name: `${prefix} ${currentCount + i + 1}`,
        status: "available" as const,
      }));
      const { error: addErr } = await supabase.from("devices").insert(toAdd);
      if (addErr) return NextResponse.json({ error: addErr.message }, { status: 500 });
    } else if (target < currentCount) {
      // remove excess devices from the end (only available ones)
      const toRemove = (existing ?? []).slice(target).map((d) => d.id);
      const { error: delErr } = await supabase
        .from("devices")
        .delete()
        .in("id", toRemove)
        .eq("status", "available");
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

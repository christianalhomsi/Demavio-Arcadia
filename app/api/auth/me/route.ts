import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ role: null, hallId: null }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? null;
  let hallId: string | null = null;

  if (role === "hall_manager") {
    const { data } = await supabase
      .from("hall_managers")
      .select("hall_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hallId = data?.hall_id ?? null;
  } else if (role === "hall_staff") {
    const { data } = await supabase
      .from("hall_staff_permissions")
      .select("hall_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hallId = data?.hall_id ?? null;
  }

  return NextResponse.json({ role, hallId });
}

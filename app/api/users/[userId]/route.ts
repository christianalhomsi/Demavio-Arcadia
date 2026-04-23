import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

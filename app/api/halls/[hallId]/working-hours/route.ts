import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ hallId: string }> }
) {
  try {
    const { hallId } = await params;
    const { working_hours } = await req.json();
    const supabase = await getServerClient();

    const { error } = await supabase
      .from("halls")
      .update({ working_hours })
      .eq("id", hallId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

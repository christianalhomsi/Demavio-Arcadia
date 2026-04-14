import { NextResponse } from "next/server";
import { staffAssignmentSchema } from "@/schemas/admin-hall";
import { assertSuperAdmin } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { findAuthUserIdByEmail } from "@/lib/admin-users";

export async function POST(request: Request) {
  const gate = await assertSuperAdmin();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const parsed = staffAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { hall_id, email, role } = parsed.data;
  const admin = getAdminClient();

  const userId = await findAuthUserIdByEmail(admin, email);
  if (!userId) {
    return NextResponse.json(
      { error: "No auth user found for that email." },
      { status: 404 }
    );
  }

  const { error: saErr } = await admin.from("staff_assignments").insert({
    user_id: userId,
    hall_id,
    role,
  });

  if (saErr) {
    console.error("[admin/staff-assignments] staff_assignments", saErr);
    return NextResponse.json({ error: saErr.message }, { status: 500 });
  }

  const { error: legacyErr } = await admin.from("staff_hall_access").insert({
    user_id: userId,
    hall_id,
  });

  if (legacyErr) {
    console.error("[admin/staff-assignments] staff_hall_access", legacyErr);
    await admin
      .from("staff_assignments")
      .delete()
      .eq("user_id", userId)
      .eq("hall_id", hall_id);
    return NextResponse.json({ error: legacyErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

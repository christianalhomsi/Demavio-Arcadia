import { NextResponse } from "next/server";
import { inviteUserSchema } from "@/schemas/admin-hall";
import { assertSuperAdmin } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const gate = await assertSuperAdmin();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email
  );

  if (error) {
    console.error("[admin/users/invite]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { user_id: data.user?.id ?? null, email: data.user?.email },
    { status: 200 }
  );
}

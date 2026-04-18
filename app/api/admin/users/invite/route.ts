import { NextResponse } from "next/server";
import { assertSuperAdmin } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const gate = await assertSuperAdmin();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (error) {
    console.error("[admin/users/invite]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("profiles").upsert({
    id: data.user.id,
    email: parsed.data.email,
    role: "player",
  });

  return NextResponse.json({ user_id: data.user.id, email: data.user.email }, { status: 201 });
}

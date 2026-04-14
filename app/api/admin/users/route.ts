import { NextResponse } from "next/server";
import { assertSuperAdmin } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const gate = await assertSuperAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") || "30")));

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

  if (error) {
    console.error("[admin/users] listUsers", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    users: (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
    })),
    total: data.total ?? data.users?.length ?? 0,
    page,
    perPage,
  });
}

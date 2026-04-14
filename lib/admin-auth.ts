import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/services/access";

export type SuperAdminGate =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function assertSuperAdmin(): Promise<SuperAdminGate> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const allowed = await isSuperAdmin(user.id);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}

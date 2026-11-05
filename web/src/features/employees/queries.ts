import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface HallMember {
  membershipId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  role: "employee" | "owner";
  status: "active" | "inactive";
  discountLimitMinor: number | null;
  grants: string[];
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export async function listHallMembers(hallId: string): Promise<HallMember[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_hall_members", { p_hall_id: hallId });
  if (error) return null;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    membershipId: r.membership_id as string,
    userId: r.user_id as string,
    displayName: r.display_name as string | null,
    email: r.email as string | null,
    role: r.role_key as HallMember["role"],
    status: r.status as HallMember["status"],
    discountLimitMinor: r.discount_limit_minor === null ? null : Number(r.discount_limit_minor),
    grants: (r.grants as string[]) ?? [],
  }));
}

export async function listPendingInvitations(hallId: string): Promise<PendingInvitation[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_hall_invitations", { p_hall_id: hallId });
  if (error) return null;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    email: r.email as string,
    role: r.role_key as string,
    expiresAt: r.expires_at as string,
  }));
}

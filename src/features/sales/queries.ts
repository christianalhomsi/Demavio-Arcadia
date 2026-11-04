import "server-only";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

const s = (v: unknown) => (v as string | null) ?? null;

export interface SalesAgentRow {
  userId: string;
  displayName: string | null;
  email: string | null;
  status: string;
  attributionsCount: number;
}

export async function listSalesAgents(): Promise<SalesAgentRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_sales_agents");
  if (error) return null;
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id as string,
    displayName: s(r.display_name),
    email: s(r.email),
    status: r.status as string,
    attributionsCount: Number(r.attributions_count),
  }));
}

export interface HallRequestRow {
  id: string;
  hallName: string;
  currency: string;
  ownerEmail: string;
  ownerUsername: string;
  requestedByName: string | null;
  managerName: string | null;
  status: "pending" | "approved" | "rejected";
  rejectedReason: string | null;
  hallId: string | null;
  canAct: boolean;
  createdAt: string;
  planName: string | null;
  planKind: "priced" | "unlimited" | null;
  planPeriod: string | null;
  planPriceMinor: number | null;
  planCurrency: string | null;
  /** False when a waiting request asks for a plan that has since been deactivated. */
  planAvailable: boolean;
}

/** Hall creation requests this person may see (own, their agents', or all for a super admin). */
export async function listHallRequests(opts: {
  status?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: HallRequestRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_hall_requests", {
    p_status: opts.status ?? null,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      hallName: r.hall_name as string,
      currency: r.currency as string,
      ownerEmail: r.owner_email as string,
      ownerUsername: r.owner_username as string,
      requestedByName: s(r.requested_by_name),
      managerName: s(r.manager_name),
      status: r.status as HallRequestRow["status"],
      rejectedReason: s(r.rejected_reason),
      hallId: s(r.hall_id),
      canAct: Boolean(r.can_act),
      createdAt: r.created_at as string,
      planName: s(r.plan_name),
      planKind: s(r.plan_kind) as HallRequestRow["planKind"],
      planPeriod: s(r.plan_period),
      planPriceMinor: r.plan_price_minor === null ? null : Number(r.plan_price_minor),
      planCurrency: s(r.plan_currency),
      planAvailable: r.plan_available !== false,
    })),
  };
}

export interface CreditRow {
  hallId: string;
  hallName: string;
  soldByName: string | null;
  soldAt: string;
}

/** Every hall sold, and who sold it. Sales managers only (RPC checks). */
export async function listSalesCredits(opts: {
  limit: number;
  offset: number;
}): Promise<{ rows: CreditRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_sales_credits", {
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      hallId: r.hall_id as string,
      hallName: r.hall_name as string,
      soldByName: s(r.sold_by_name),
      soldAt: r.sold_at as string,
    })),
  };
}

export interface TeamMemberRow {
  userId: string;
  displayName: string | null;
  email: string | null;
  status: string;
  soldCount: number;
  openRequests: number;
}

/** The agents the signed-in sales manager is responsible for. Sales managers only (RPC checks). */
export async function listMyTeam(): Promise<TeamMemberRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_team");
  if (error) return null;
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id as string,
    displayName: s(r.display_name),
    email: s(r.email),
    status: r.status as string,
    soldCount: Number(r.sold_count),
    openRequests: Number(r.open_requests),
  }));
}

export interface ManagerRow {
  displayName: string | null;
  email: string | null;
  username: string | null;
}

/** The signed-in agent's manager: null when none is assigned, undefined when loading failed. */
export async function getMyManager(): Promise<ManagerRow | null | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_sales_manager");
  if (error) return undefined;
  const r = ((data ?? []) as Row[])[0];
  return r ? { displayName: s(r.display_name), email: s(r.email), username: s(r.username) } : null;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

export interface PlatformMetrics {
  hallsTotal: number;
  hallsActive: number;
  usersTotal: number;
  agentsTotal: number;
  agentsRecent: number;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_metrics");
  const r = (data as Row[] | null)?.[0];
  if (error || !r) return null;
  const n = (k: string) => Number(r[k]);
  return {
    hallsTotal: n("halls_total"),
    hallsActive: n("halls_active"),
    usersTotal: n("users_total"),
    agentsTotal: n("agents_total"),
    agentsRecent: n("agents_recent"),
  };
}

export interface PlatformUserRow {
  id: string;
  displayName: string | null;
  email: string | null;
  status: "active" | "inactive";
  platformRoles: string[];
  hallRoles: string[];
  hallsCount: number;
}

export async function listPlatformUsers(opts: {
  search?: string;
  role?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: PlatformUserRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: opts.search ?? null,
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_role: opts.role ?? null,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      displayName: (r.display_name as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      status: r.status as PlatformUserRow["status"],
      platformRoles: (r.platform_roles as string[]) ?? [],
      hallRoles: (r.hall_roles as string[]) ?? [],
      hallsCount: Number(r.halls_count),
    })),
  };
}

/** People per tab of the users page: "all", each platform role, and "none" (no platform role). */
export async function getUserRoleCounts(): Promise<Record<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_role_counts");
  if (error) return null;
  return Object.fromEntries(
    ((data ?? []) as Row[]).map((r) => [r.role_key as string, Number(r.n)]),
  );
}

export interface PlatformAuditEntry {
  id: string;
  createdAt: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export async function listPlatformAudit(opts: {
  limit: number;
  offset: number;
  action?: string;
}): Promise<{ entries: PlatformAuditEntry[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_audit", {
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_action: opts.action ?? null,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    entries: rows.map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      actorName: (r.actor_name as string | null) ?? null,
      action: r.action as string,
      targetType: (r.target_type as string | null) ?? null,
      targetId: (r.target_id as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      before: r.before_data,
      after: r.after_data,
    })),
  };
}

export interface HallHealthRow {
  hallId: string;
  hallName: string;
  hallStatus: "active" | "inactive";
  agentsTotal: number;
  agentsRecent: number;
  agentsNeverSeen: number;
  commandsFailed24h: number;
  commandsPending: number;
}

/** Operational health only. No cash, payment or discrepancy data (a super admin has no hall finance access). */
export async function listHallHealth(): Promise<HallHealthRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_monitoring");
  if (error) return null;
  return ((data ?? []) as Row[]).map((r) => ({
    hallId: r.hall_id as string,
    hallName: r.hall_name as string,
    hallStatus: r.hall_status as HallHealthRow["hallStatus"],
    agentsTotal: Number(r.agents_total),
    agentsRecent: Number(r.agents_recent),
    agentsNeverSeen: Number(r.agents_never_seen),
    commandsFailed24h: Number(r.commands_failed_24h),
    commandsPending: Number(r.commands_pending),
  }));
}

export interface SoldHallRow {
  hallId: string;
  hallName: string;
  hallStatus: "active" | "inactive";
  currency: string;
  ownerEmail: string | null;
  ownerUsername: string | null;
  createdAt: string;
  soldById: string | null;
  soldByName: string | null;
  soldByEmail: string | null;
  soldAt: string | null;
  planName: string | null;
  planPriceMinor: number | null;
  planCurrency: string | null;
  planKind: "priced" | "unlimited" | null;
  planPeriod: string | null;
  subscriptionStartedAt: string;
  /** Null for the unlimited plan, which never ends. */
  subscriptionEndsAt: string | null;
  subscriptionExpired: boolean;
  attributionStatus: "active" | "disputed" | "resolved" | null;
}

/** Every hall with the sales person who brought it in (null = created directly by a super admin). */
export async function listHallsSold(opts: {
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: SoldHallRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_halls_sold", {
    p_search: opts.search ?? null,
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
      hallStatus: r.hall_status as SoldHallRow["hallStatus"],
      currency: r.currency as string,
      ownerEmail: (r.owner_email as string | null) ?? null,
      ownerUsername: (r.owner_username as string | null) ?? null,
      createdAt: r.created_at as string,
      soldById: (r.sold_by_id as string | null) ?? null,
      soldByName: (r.sold_by_name as string | null) ?? null,
      soldByEmail: (r.sold_by_email as string | null) ?? null,
      soldAt: (r.sold_at as string | null) ?? null,
      planName: (r.plan_name as string | null) ?? null,
      planPriceMinor: r.plan_price_minor === null ? null : Number(r.plan_price_minor),
      planCurrency: (r.plan_currency as string | null) ?? null,
      planKind: (r.plan_kind as SoldHallRow["planKind"]) ?? null,
      planPeriod: (r.plan_period as string | null) ?? null,
      subscriptionStartedAt: r.subscription_started_at as string,
      subscriptionEndsAt: (r.subscription_ends_at as string | null) ?? null,
      subscriptionExpired:
        r.subscription_ends_at != null &&
        new Date(r.subscription_ends_at as string).getTime() < Date.now(),
      attributionStatus: (r.attribution_status as SoldHallRow["attributionStatus"]) ?? null,
    })),
  };
}

export interface SalesMemberRow {
  userId: string;
  displayName: string | null;
  email: string | null;
  username: string | null;
  role: "sales_agent" | "sales_admin";
  status: "active" | "inactive";
  responsibleId: string | null;
  responsibleName: string | null;
  hallsSold: number;
  createdAt: string;
}

export async function listSalesTeam(): Promise<SalesMemberRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_sales_team");
  if (error) return null;
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id as string,
    displayName: (r.display_name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    username: (r.username as string | null) ?? null,
    role: r.role_key as SalesMemberRow["role"],
    status: r.status as SalesMemberRow["status"],
    responsibleId: (r.responsible_id as string | null) ?? null,
    responsibleName: (r.responsible_name as string | null) ?? null,
    hallsSold: Number(r.halls_sold),
    createdAt: r.created_at as string,
  }));
}

export interface SubscriptionPlanRow {
  id: string;
  name: string;
  priceMinor: number;
  /** Null for the fixed unlimited plan, which has no price. */
  currency: string | null;
  status: "active" | "inactive";
  hallsCount: number;
  kind: "priced" | "unlimited";
  period: string | null;
  details: string | null;
}

/** Subscription plans: all of them for a super admin, only the active ones for a sales manager. */
export async function listSubscriptionPlans(): Promise<SubscriptionPlanRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_subscription_plans");
  if (error) return null;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    priceMinor: Number(r.price_minor),
    currency: (r.currency as string | null) ?? null,
    status: r.status as SubscriptionPlanRow["status"],
    hallsCount: Number(r.halls_count),
    kind: r.kind as SubscriptionPlanRow["kind"],
    period: (r.period as string | null) ?? null,
    details: (r.details as string | null) ?? null,
  }));
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/types/transaction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Finance" };

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { start, end };
}

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type TransactionRow = {
  id: string;
  type: TransactionType;
  amount: number;
  note: string | null;
  created_at: string;
};

const TX_STYLE: Record<TransactionType, string> = {
  session_income: "bg-green-500/15 text-green-400",
  expense:        "bg-red-500/15 text-red-400",
  refund:         "bg-amber-500/15 text-amber-400",
  adjustment:     "bg-slate-500/15 text-slate-400",
};

const TX_LABEL: Record<TransactionType, string> = {
  session_income: "Income",
  expense:        "Expense",
  refund:         "Refund",
  adjustment:     "Adjustment",
};

async function getTodayRevenue(hallId: string): Promise<number> {
  const supabase = await getServerClient();
  const { start, end } = todayRange();
  const { data } = await supabase
    .from("payments")
    .select("amount, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("sessions.devices.hall_id", hallId)
    .gte("created_at", start)
    .lt("created_at", end);
  return ((data ?? []) as { amount: number }[]).reduce((s, p) => s + p.amount, 0);
}

async function getTodaySessionCount(hallId: string): Promise<number> {
  const supabase = await getServerClient();
  const { start, end } = todayRange();
  const { count } = await supabase
    .from("sessions")
    .select("id, devices!inner(hall_id)", { count: "exact", head: true })
    .eq("devices.hall_id", hallId)
    .gte("started_at", start)
    .lt("started_at", end);
  return count ?? 0;
}

async function getRecentTransactions(hallId: string): Promise<TransactionRow[]> {
  const supabase = await getServerClient();
  const { data: paymentData } = await supabase
    .from("payments")
    .select("id, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("sessions.devices.hall_id", hallId)
    .order("created_at", { ascending: false })
    .limit(100);

  const paymentIds = ((paymentData ?? []) as { id: string }[]).map((p) => p.id);
  if (paymentIds.length === 0) return [];

  const { data } = await supabase
    .from("financial_transactions")
    .select("id, type, amount, note, created_at")
    .in("reference_id", paymentIds)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []) as TransactionRow[];
}

async function FinanceSummary({ hallId }: { hallId: string }) {
  const [revenue, sessionCount] = await Promise.all([
    getTodayRevenue(hallId),
    getTodaySessionCount(hallId),
  ]);

  const stats = [
    { label: "Today's Revenue", value: `$${fmtCurrency(revenue)}`,  color: "text-primary" },
    { label: "Total Sessions",  value: String(sessionCount),         color: "text-cyan-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map(({ label, value, color }) => (
        <Card key={label} className="border-border/60">
          <CardContent className="pt-5 pb-4">
            <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function TransactionsTable({ hallId }: { hallId: string }) {
  const rows = await getRecentTransactions(hallId);

  return (
    <Card className="border-border/60 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
      </CardHeader>
      <Separator className="opacity-40" />
      {rows.length === 0 ? (
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No transactions recorded yet.</p>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                {["Type", "Amount", "Note", "Date"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left section-heading">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isDebit = r.type === "expense" || r.type === "refund";
                return (
                  <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TX_STYLE[r.type] ?? TX_STYLE.adjustment}`}>
                        {TX_LABEL[r.type] ?? r.type}
                      </span>
                    </td>
                    <td className={`px-4 py-3 tabular-nums font-medium whitespace-nowrap ${isDebit ? "text-red-400" : "text-green-400"}`}>
                      {isDebit ? "−" : "+"}${fmtCurrency(r.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.note ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default async function FinancePage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  return (
    <div className="page-shell">
      <div>
        <h1 className="text-xl font-bold">Finance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Revenue & transactions</p>
      </div>
      <Separator className="opacity-40" />
      <Suspense fallback={<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{Array.from({length:2}).map((_,i)=><Skeleton key={i} className="h-24 rounded-xl skeleton-shimmer"/>)}</div>}>
        <FinanceSummary hallId={hallId} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl skeleton-shimmer" />}>
        <TransactionsTable hallId={hallId} />
      </Suspense>
    </div>
  );
}

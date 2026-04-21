import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/types/transaction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { DollarSign, Gamepad2, TrendingUp, TrendingDown, RefreshCw, SlidersHorizontal, Receipt } from "lucide-react";
import Link from "next/link";

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

type TransactionRow = { id: string; type: TransactionType; amount: number; note: string | null; created_at: string };

const TX_STYLE: Record<TransactionType, string> = {
  session_income: "bg-green-500/15 text-green-400",
  expense:        "bg-red-500/15 text-red-400",
  refund:         "bg-amber-500/15 text-amber-400",
  adjustment:     "bg-slate-500/15 text-slate-400",
};
// TX_LABEL is now built from translations inside the async component
const TX_ICON: Record<TransactionType, React.ElementType> = {
  session_income: TrendingUp, expense: TrendingDown, refund: RefreshCw, adjustment: SlidersHorizontal,
};

async function FinanceContent({ hallId }: { hallId: string }) {
  const supabase = await getServerClient();
  const t = await getTranslations("dashboard");
  const { start, end } = todayRange();

  const TX_LABEL: Record<TransactionType, string> = {
    session_income: t("income"), expense: t("expense"), refund: t("refund"), adjustment: t("adjustment"),
  };

  // all queries in parallel
  const [paymentsRes, sessionCountRes, allPaymentsRes] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, sessions!inner(device_id, devices!inner(hall_id))")
      .eq("sessions.devices.hall_id", hallId)
      .gte("created_at", start)
      .lt("created_at", end),
    supabase
      .from("sessions")
      .select("id, devices!inner(hall_id)", { count: "exact", head: true })
      .eq("devices.hall_id", hallId)
      .gte("started_at", start)
      .lt("started_at", end),
    supabase
      .from("payments")
      .select("id, sessions!inner(device_id, devices!inner(hall_id))")
      .eq("sessions.devices.hall_id", hallId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const revenue = ((paymentsRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + p.amount, 0);
  const sessionCount = sessionCountRes.count ?? 0;

  const paymentIds = ((allPaymentsRes.data ?? []) as { id: string }[]).map(p => p.id);
  let transactions: TransactionRow[] = [];
  if (paymentIds.length > 0) {
    const { data } = await supabase
      .from("financial_transactions")
      .select("id, type, amount, note, created_at")
      .in("reference_id", paymentIds)
      .order("created_at", { ascending: false })
      .limit(20);
    transactions = (data ?? []) as TransactionRow[];
  }

  const stats = [
    { label: t("todayRevenue"),  value: `$${fmtCurrency(revenue)}`, color: "text-primary",  icon: DollarSign },
    { label: t("totalSessions"), value: String(sessionCount),        color: "text-cyan-400", icon: Gamepad2 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map(({ label, value, color, icon: Icon }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon size={14} className="text-muted-foreground/40" />
              </div>
              <p className={`text-3xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Link href={`/dashboard/${hallId}/finance/invoices`}>
        <Button variant="outline" className="w-full sm:w-auto">
          <Receipt size={16} className="mr-2" />
          {t("invoices")}
        </Button>
      </Link>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t("recentTransactions")}</CardTitle>
        </CardHeader>
        <Separator className="opacity-40" />
        {transactions.length === 0 ? (
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("noTransactions")}</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  {[t("type"), t("amount"), t("note"), t("date")].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left section-heading">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((r) => {
                  const isDebit = r.type === "expense" || r.type === "refund";
                  const Icon = TX_ICON[r.type] ?? SlidersHorizontal;
                  return (
                    <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${TX_STYLE[r.type] ?? TX_STYLE.adjustment}`}>
                          <Icon size={11} />
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
    </>
  );
}

function FinanceSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl skeleton-shimmer" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl skeleton-shimmer" />
    </>
  );
}

export default async function FinancePage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const t = await getTranslations("dashboard");
  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <DollarSign size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">{t("finance")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("revenueTransactions")}</p>
        </div>
      </div>
      <Separator className="opacity-40" />
      <Suspense fallback={<FinanceSkeleton />}>
        <FinanceContent hallId={hallId} />
      </Suspense>
    </div>
  );
}

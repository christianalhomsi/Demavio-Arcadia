import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/types/transaction";
import TransactionsTable, { type TransactionRow } from "./transactions-table";

export const metadata: Metadata = { title: "Transactions | Arcadia" };

// ─── data fetching ────────────────────────────────────────────────────────────

async function getHallTransactions(hallId: string): Promise<TransactionRow[]> {
  const supabase = await getServerClient();

  // Resolve payment IDs scoped to this hall via sessions → devices
  const { data: paymentData } = await supabase
    .from("payments")
    .select("id, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("sessions.devices.hall_id", hallId)
    .order("created_at", { ascending: false })
    .limit(500);

  const paymentIds = ((paymentData ?? []) as { id: string }[]).map((p) => p.id);
  if (paymentIds.length === 0) return [];

  const { data } = await supabase
    .from("financial_transactions")
    .select("id, type, amount, note, created_at")
    .in("reference_id", paymentIds)
    .order("created_at", { ascending: false });

  return (data ?? []) as TransactionRow[];
}

// ─── inner async component ────────────────────────────────────────────────────

async function TransactionsLoader({ hallId }: { hallId: string }) {
  const rows = await getHallTransactions(hallId);
  return <TransactionsTable rows={rows} />;
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 mb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-lg skeleton-shimmer" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-11 rounded-lg skeleton-shimmer" />
      ))}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage({
  params,
}: {
  params: { hallId: string };
}) {
  return (
    <div className="page-shell">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Transactions</h1>
        <Link href={`/dashboard/${params.hallId}/finance`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">
          ← Finance overview
        </Link>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <Suspense fallback={<TableSkeleton />}>
          <TransactionsLoader hallId={params.hallId} />
        </Suspense>
      </div>
    </div>
  );
}


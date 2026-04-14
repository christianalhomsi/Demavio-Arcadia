import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/types/transaction";
import TransactionsTable, { type TransactionRow } from "./transactions-table";

export const metadata: Metadata = { title: "Transactions | Gaming Hub" };

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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ ...skel, height: "32px", width: "120px" }} />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ ...skel, height: "44px" }} />
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
    <div style={page}>
      <div style={pageHeader}>
        <p style={pageHeading}>Transactions</p>
        <Link href={`/dashboard/${params.hallId}/finance`} style={backLink}>
          ← Finance overview
        </Link>
      </div>

      <div style={card}>
        <Suspense fallback={<TableSkeleton />}>
          <TransactionsLoader hallId={params.hallId} />
        </Suspense>
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  maxWidth: "960px",
};

const pageHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "1rem",
};

const pageHeading: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#111827",
};

const backLink: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#6b7280",
  textDecoration: "none",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  padding: "1.5rem",
};

const skel: React.CSSProperties = {
  borderRadius: "0.375rem",
  background: "#e5e7eb",
  width: "100%",
};

import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { TransactionType } from "@/types/transaction";

export const metadata: Metadata = { title: "Finance | Gaming Hub" };

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { start, end };
}

function fmtCurrency(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ─── types ────────────────────────────────────────────────────────────────────

type PaymentRow = { amount: number };

type TransactionRow = {
  id: string;
  type: TransactionType;
  amount: number;
  note: string | null;
  created_at: string;
};

// ─── data fetching ────────────────────────────────────────────────────────────

/**
 * Fetch today's payments for this hall by joining:
 * payments → sessions → devices (filtered by hall_id)
 */
async function getTodayPayments(hallId: string): Promise<PaymentRow[]> {
  const supabase = getServerClient();
  const { start, end } = todayRange();

  const { data } = await supabase
    .from("payments")
    .select("amount, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("sessions.devices.hall_id", hallId)
    .gte("created_at", start)
    .lt("created_at", end);

  return (data ?? []) as PaymentRow[];
}

/**
 * Fetch total session count for this hall today (same join chain).
 */
async function getTodaySessionCount(hallId: string): Promise<number> {
  const supabase = getServerClient();
  const { start, end } = todayRange();

  const { count } = await supabase
    .from("sessions")
    .select("id, devices!inner(hall_id)", { count: "exact", head: true })
    .eq("devices.hall_id", hallId)
    .gte("started_at", start)
    .lt("started_at", end);

  return count ?? 0;
}

/**
 * Fetch recent financial_transactions for this hall by joining through
 * payments → sessions → devices. Falls back to all transactions if the
 * reference chain is unavailable (reference_type may vary).
 */
async function getRecentTransactions(hallId: string): Promise<TransactionRow[]> {
  const supabase = getServerClient();

  // Get payment ids for this hall to scope transactions
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

// ─── TX type badge ────────────────────────────────────────────────────────────

const TX_STYLE: Record<TransactionType, React.CSSProperties> = {
  session_income: { background: "#dcfce7", color: "#15803d" },
  expense:        { background: "#fee2e2", color: "#b91c1c" },
  refund:         { background: "#fef9c3", color: "#a16207" },
  adjustment:     { background: "#f3f4f6", color: "#6b7280" },
};

const TX_LABEL: Record<TransactionType, string> = {
  session_income: "Income",
  expense:        "Expense",
  refund:         "Refund",
  adjustment:     "Adjustment",
};

// ─── summary cards ────────────────────────────────────────────────────────────

async function FinanceSummary({ hallId }: { hallId: string }) {
  const [payments, sessionCount] = await Promise.all([
    getTodayPayments(hallId),
    getTodaySessionCount(hallId),
  ]);

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

  const stats = [
    { label: "Today's revenue",  value: `$${fmtCurrency(totalRevenue)}`, accent: "#111827" },
    { label: "Total sessions",   value: String(sessionCount),            accent: "#1d4ed8" },
  ];

  return (
    <div style={statsGrid}>
      {stats.map(({ label, value, accent }) => (
        <div key={label} style={statCard}>
          <span style={{ ...statValue, color: accent }}>{value}</span>
          <span style={statLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div style={statsGrid}>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} style={{ ...statCard, gap: "0.5rem" }}>
          <div style={{ ...skel, height: "2rem", width: "6rem" }} />
          <div style={{ ...skel, height: "0.875rem", width: "5rem" }} />
        </div>
      ))}
    </div>
  );
}

// ─── transactions table ───────────────────────────────────────────────────────

async function TransactionsTable({ hallId }: { hallId: string }) {
  const rows = await getRecentTransactions(hallId);

  return (
    <div style={section}>
      <p style={sectionHeading}>Recent transactions</p>
      {rows.length === 0 ? (
        <p style={empty}>No transactions recorded yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                {["Type", "Amount", "Note", "Date"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = TX_STYLE[r.type] ?? TX_STYLE.adjustment;
                const label = TX_LABEL[r.type] ?? r.type;
                const isDebit = r.type === "expense" || r.type === "refund";
                return (
                  <tr key={r.id} style={tableRow}>
                    <td style={td}>
                      <span style={{ ...badgeBase, ...badge }}>{label}</span>
                    </td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums", color: isDebit ? "#b91c1c" : "#15803d", whiteSpace: "nowrap" }}>
                      {isDebit ? "−" : "+"}${fmtCurrency(r.amount)}
                    </td>
                    <td style={{ ...td, color: "#6b7280" }}>{r.note ?? "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "#6b7280" }}>{fmtDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TransactionsSkeleton() {
  return (
    <div style={section}>
      <div style={{ ...skel, height: "1rem", width: "160px", marginBottom: "1rem" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ ...skel, height: "44px" }} />
        ))}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function FinancePage({
  params,
}: {
  params: { hallId: string };
}) {
  const { hallId } = params;

  return (
    <div style={page}>
      <p style={pageHeading}>Finance</p>

      <Suspense fallback={<SummarySkeleton />}>
        <FinanceSummary hallId={hallId} />
      </Suspense>

      <Suspense fallback={<TransactionsSkeleton />}>
        <TransactionsTable hallId={hallId} />
      </Suspense>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
  maxWidth: "900px",
};

const pageHeading: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#111827",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: "1rem",
};

const statCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  padding: "1.25rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
};

const statValue: React.CSSProperties = {
  fontSize: "1.625rem",
  fontWeight: 700,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const statLabel: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: "#6b7280",
};

const section: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  padding: "1.5rem",
};

const sectionHeading: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "#111827",
};

const empty: React.CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: "#6b7280",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.875rem",
};

const th: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
};

const td: React.CSSProperties = {
  padding: "0.625rem 0.75rem",
  color: "#111827",
  verticalAlign: "middle",
};

const badgeBase: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 500,
  padding: "0.2rem 0.6rem",
  borderRadius: "9999px",
};

const skel: React.CSSProperties = {
  borderRadius: "0.375rem",
  background: "#e5e7eb",
};

"use client";

import { useState, useMemo } from "react";
import type { TransactionType } from "@/types/transaction";

export type TransactionRow = {
  id: string;
  type: TransactionType;
  amount: number;
  note: string | null;
  created_at: string;
};

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

const ALL_TYPES: TransactionType[] = [
  "session_income",
  "expense",
  "refund",
  "adjustment",
];

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TransactionsTable({ rows }: { rows: TransactionRow[] }) {
  const [typeFilter, setTypeFilter]       = useState<TransactionType | "">("");
  const [dateFrom,   setDateFrom]         = useState("");
  const [dateTo,     setDateTo]           = useState("");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false;
      if (dateFrom && r.created_at < dateFrom) return false;
      if (dateTo) {
        // dateTo is a date string "YYYY-MM-DD"; include the full day
        const endOfDay = dateTo + "T23:59:59.999Z";
        if (r.created_at > endOfDay) return false;
      }
      return true;
    });
  }, [rows, typeFilter, dateFrom, dateTo]);

  const hasFilters = typeFilter || dateFrom || dateTo;

  return (
    <div style={wrapper}>
      {/* ── filters ── */}
      <div style={filterBar}>
        <div style={filterGroup}>
          <label style={filterLabel}>Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TransactionType | "")}
            style={selectStyle}
          >
            <option value="">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{TX_LABEL[t]}</option>
            ))}
          </select>
        </div>

        <div style={filterGroup}>
          <label style={filterLabel}>From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={filterGroup}>
          <label style={filterLabel}>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => { setTypeFilter(""); setDateFrom(""); setDateTo(""); }}
            style={clearBtn}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── table ── */}
      {filtered.length === 0 ? (
        <p style={empty}>
          {hasFilters ? "No transactions match the current filters." : "No transactions recorded yet."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                {["Date", "Type", "Amount", "Method", "Notes"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const badge   = TX_STYLE[r.type] ?? TX_STYLE.adjustment;
                const label   = TX_LABEL[r.type] ?? r.type;
                const isDebit = r.type === "expense" || r.type === "refund";
                return (
                  <tr key={r.id} style={tableRow}>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "#6b7280" }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={td}>
                      <span style={{ ...badgeBase, ...badge }}>{label}</span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: isDebit ? "#b91c1c" : "#15803d" }}>
                      {isDebit ? "−" : "+"}${fmtCurrency(r.amount)}
                    </td>
                    <td style={{ ...td, color: "#9ca3af" }}>—</td>
                    <td style={{ ...td, color: "#6b7280", maxWidth: "260px" }}>
                      {r.note ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={countLabel}>
        {filtered.length} of {rows.length} transaction{rows.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const wrapper: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const filterBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  alignItems: "flex-end",
};

const filterGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const filterLabel: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "#374151",
};

const selectStyle: React.CSSProperties = {
  padding: "0.4rem 0.625rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  fontSize: "0.8125rem",
  background: "#fff",
  outline: "none",
  minWidth: "130px",
};

const inputStyle: React.CSSProperties = {
  padding: "0.4rem 0.625rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  fontSize: "0.8125rem",
  background: "#fff",
  outline: "none",
};

const clearBtn: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontSize: "0.8125rem",
  cursor: "pointer",
  alignSelf: "flex-end",
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

const countLabel: React.CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: "#9ca3af",
  textAlign: "right",
};

"use client";

import { useState, useMemo } from "react";
import type { AuditAction, AuditLogEntry } from "@/types/audit";

const ACTION_STYLE: Record<AuditAction, React.CSSProperties> = {
  create:    { background: "#dcfce7", color: "#15803d" },
  update:    { background: "#dbeafe", color: "#1d4ed8" },
  delete:    { background: "#fee2e2", color: "#b91c1c" },
  open:      { background: "#dcfce7", color: "#15803d" },
  close:     { background: "#f3f4f6", color: "#6b7280" },
  check_in:  { background: "#dbeafe", color: "#1d4ed8" },
  check_out: { background: "#fef9c3", color: "#a16207" },
  verify:    { background: "#f3e8ff", color: "#7c3aed" },
};

const ALL_ACTIONS: AuditAction[] = [
  "create", "update", "delete", "open", "close", "check_in", "check_out", "verify",
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function shortId(id: string) {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function AuditLogsTable({ rows }: { rows: AuditLogEntry[] }) {
  const [actionFilter,     setActionFilter]     = useState<AuditAction | "">("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [dateFrom,         setDateFrom]         = useState("");
  const [dateTo,           setDateTo]           = useState("");

  const entityTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.entity_type))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (actionFilter     && r.action      !== actionFilter)     return false;
      if (entityTypeFilter && r.entity_type !== entityTypeFilter) return false;
      if (dateFrom && r.created_at < dateFrom) return false;
      if (dateTo   && r.created_at > dateTo + "T23:59:59.999Z")  return false;
      return true;
    });
  }, [rows, actionFilter, entityTypeFilter, dateFrom, dateTo]);

  const hasFilters = actionFilter || entityTypeFilter || dateFrom || dateTo;

  function clearFilters() {
    setActionFilter("");
    setEntityTypeFilter("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div style={wrapper}>
      {/* ── filters ── */}
      <div style={filterBar}>
        <div style={filterGroup}>
          <label style={filterLabel}>Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as AuditAction | "")}
            style={selectStyle}
          >
            <option value="">All actions</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{a.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <div style={filterGroup}>
          <label style={filterLabel}>Entity type</label>
          <select
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
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
          <button onClick={clearFilters} style={clearBtn}>Clear</button>
        )}
      </div>

      {/* ── table ── */}
      {filtered.length === 0 ? (
        <p style={empty}>
          {hasFilters ? "No entries match the current filters." : "No audit log entries found."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                {["Date", "User", "Action", "Entity type", "Entity ID"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const badge = ACTION_STYLE[r.action] ?? ACTION_STYLE.update;
                return (
                  <tr key={r.id} style={tableRow}>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "#6b7280" }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "0.8125rem", color: "#6b7280" }}>
                      {shortId(r.user_id)}
                    </td>
                    <td style={td}>
                      <span style={{ ...badgeBase, ...badge }}>
                        {r.action.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ ...td, color: "#374151" }}>{r.entity_type}</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "0.8125rem", color: "#6b7280" }}>
                      {shortId(r.entity_id)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={countLabel}>
        {filtered.length} of {rows.length} entr{rows.length !== 1 ? "ies" : "y"}
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
  borderRadius: "0.5rem",
  border: "1px solid oklch(0.3 0.01 265 / 0.2)",
  fontSize: "0.8125rem",
  background: "oklch(0.13 0.010 265)",
  color: "oklch(0.85 0.005 265)",
  outline: "none",
  minWidth: "130px",
  cursor: "pointer",
  transition: "all 0.2s",
};

const inputStyle: React.CSSProperties = {
  padding: "0.4rem 0.625rem",
  borderRadius: "0.5rem",
  border: "1px solid oklch(0.3 0.01 265 / 0.2)",
  fontSize: "0.8125rem",
  background: "oklch(0.13 0.010 265)",
  color: "oklch(0.85 0.005 265)",
  outline: "none",
  cursor: "pointer",
};

const clearBtn: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid oklch(0.3 0.01 265 / 0.2)",
  background: "oklch(0.13 0.010 265)",
  color: "oklch(0.85 0.005 265)",
  fontSize: "0.8125rem",
  cursor: "pointer",
  alignSelf: "flex-end",
  transition: "all 0.2s",
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
  textTransform: "capitalize",
};

const countLabel: React.CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: "#9ca3af",
  textAlign: "right",
};

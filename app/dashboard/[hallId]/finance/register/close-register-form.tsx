"use client";

import { useState } from "react";
import { calculateVariance } from "@/lib/cash-register";
import { closeRegisterAction } from "./actions";

export default function CloseRegisterForm({
  registerId,
  hallId,
  expectedBalance,
}: {
  registerId: string;
  hallId: string;
  expectedBalance: number;
}) {
  const [value, setValue]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const actualBalance = parseFloat(value);
  const validInput    = !isNaN(actualBalance) && actualBalance >= 0;
  const variance      = validInput ? calculateVariance(actualBalance, expectedBalance) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validInput) { setError("Enter a valid actual balance."); return; }
    setError(null);
    setLoading(true);
    const result = await closeRegisterAction(registerId, hallId, actualBalance);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} style={form}>
      <div style={fieldWrap}>
        <label htmlFor="actual_balance" style={labelStyle}>
          Actual balance (cash counted)
        </label>
        <input
          id="actual_balance"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={inputStyle}
        />
      </div>

      {variance !== null && (
        <div style={varianceRow}>
          <span style={varianceLabel}>Variance</span>
          <span style={{ ...varianceValue, color: variance === 0 ? "#15803d" : variance > 0 ? "#1d4ed8" : "#b91c1c" }}>
            {variance > 0 ? "+" : ""}${Math.abs(variance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {variance > 0 ? " surplus" : variance < 0 ? " shortage" : " balanced"}
          </span>
        </div>
      )}

      {error && <span style={errorStyle}>{error}</span>}

      <button
        type="submit"
        disabled={loading || !validInput}
        style={closeBtn(loading || !validInput)}
      >
        {loading ? "Closing…" : "Close register"}
      </button>
    </form>
  );
}

const form: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
  paddingTop: "0.25rem",
  borderTop: "1px solid #f3f4f6",
};

const fieldWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const varianceRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.625rem 0.875rem",
  background: "#f9fafb",
  borderRadius: "0.375rem",
};

const varianceLabel: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#6b7280",
};

const varianceValue: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};

const errorStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#ef4444",
};

const closeBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  border: disabled ? "none" : "1px solid #fca5a5",
  background: disabled ? "#9ca3af" : "#fff",
  color: disabled ? "#fff" : "#b91c1c",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  alignSelf: "flex-start",
});

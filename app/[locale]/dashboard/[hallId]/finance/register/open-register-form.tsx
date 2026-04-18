"use client";

import { useState } from "react";
import { openRegisterAction } from "./actions";

export default function OpenRegisterForm({ hallId }: { hallId: string }) {
  const [value, setValue]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseFloat(value);
    if (isNaN(balance) || balance < 0) {
      setError("Enter a valid opening balance.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await openRegisterAction(hallId, balance);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} style={form}>
      <div style={fieldWrap}>
        <label htmlFor="opening_balance" style={labelStyle}>
          Opening balance
        </label>
        <input
          id="opening_balance"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={inputStyle}
        />
      </div>
      {error && <span style={errorStyle}>{error}</span>}
      <button type="submit" disabled={loading || !value} style={btnStyle(loading || !value)}>
        {loading ? "Opening…" : "Open register"}
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

const errorStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#ef4444",
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  border: "none",
  background: disabled ? "#9ca3af" : "#111827",
  color: "#fff",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  alignSelf: "flex-start",
});

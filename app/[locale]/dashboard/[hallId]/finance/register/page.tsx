import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { calculateExpectedBalance } from "@/lib/cash-register";
import type { CashRegister } from "@/types/cash-register";
import OpenRegisterForm from "./open-register-form";
import CloseRegisterForm from "./close-register-form";

export const metadata: Metadata = { title: "Cash Register | Arcadia" };

// ─── data ─────────────────────────────────────────────────────────────────────

async function getOpenRegister(hallId: string): Promise<CashRegister | null> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("cash_registers")
    .select("id, hall_id, opened_by, opening_balance, status, opened_at, closed_at")
    .eq("hall_id", hallId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function getTotalIncome(hallId: string): Promise<number> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("payments")
    .select("amount, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("sessions.devices.hall_id", hallId);
  return ((data ?? []) as { amount: number }[]).reduce((sum, p) => sum + p.amount, 0);
}

// ─── inner async component ────────────────────────────────────────────────────

async function RegisterContent({ hallId }: { hallId: string }) {
  const [register, totalIncome] = await Promise.all([
    getOpenRegister(hallId),
    getTotalIncome(hallId),
  ]);

  if (!register) {
    return (
      <div style={card}>
        <div style={statusRow}>
          <span style={{ ...statusBadge, background: "#f3f4f6", color: "#6b7280" }}>
            Closed
          </span>
          <p style={statusNote}>No register is currently open for this hall.</p>
        </div>
        <OpenRegisterForm hallId={hallId} />
      </div>
    );
  }

  const expectedBalance = calculateExpectedBalance(
    register.opening_balance,
    totalIncome,
    0 // total_outflows — no outflow tracking in current schema
  );

  return (
    <div style={card}>
      <div style={statusRow}>
        <span style={{ ...statusBadge, background: "#dcfce7", color: "#15803d" }}>
          Open
        </span>
        <p style={statusNote}>
          Opened {new Date(register.opened_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>

      <div style={infoGrid}>
        <InfoRow label="Opening balance"  value={`$${fmt(register.opening_balance)}`} />
        <InfoRow label="Total income"     value={`$${fmt(totalIncome)}`} />
        <InfoRow label="Expected balance" value={`$${fmt(expectedBalance)}`} accent />
      </div>

      <CloseRegisterForm
        registerId={register.id}
        hallId={hallId}
        expectedBalance={expectedBalance}
      />
    </div>
  );
}

function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div style={infoRow}>
      <span style={infoLabel}>{label}</span>
      <span style={{ ...infoValue, fontWeight: accent ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function RegisterSkeleton() {
  return (
    <div style={card}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...skel, height: "36px" }} />
        ))}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage({
  params,
}: {
  params: { hallId: string };
}) {
  return (
    <div style={page}>
      <div style={pageHeader}>
        <p style={pageHeading}>Cash register</p>
        <Link href={`/dashboard/${params.hallId}/finance`} style={backLink}>
          ← Finance overview
        </Link>
      </div>
      <Suspense fallback={<RegisterSkeleton />}>
        <RegisterContent hallId={params.hallId} />
      </Suspense>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  maxWidth: "520px",
  fontFamily: "system-ui, sans-serif",
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
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  padding: "1.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

const statusRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
};

const statusBadge: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  padding: "0.25rem 0.75rem",
  borderRadius: "9999px",
};

const statusNote: React.CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: "#6b7280",
};

const infoGrid: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "1rem",
  background: "#f9fafb",
  borderRadius: "0.5rem",
};

const infoRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const infoLabel: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#6b7280",
};

const infoValue: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#111827",
  fontVariantNumeric: "tabular-nums",
};

const skel: React.CSSProperties = {
  borderRadius: "0.375rem",
  background: "#e5e7eb",
  width: "100%",
};

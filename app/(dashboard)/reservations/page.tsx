import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Reservations | Gaming Hub" };

type ReservationRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  devices: { name: string; halls: { name: string } | null } | null;
};

const STATUS: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: "#14532d33", color: "#22c55e" },
  active:    { bg: "#1e3a5f33", color: "#60a5fa" },
  cancelled: { bg: "#7f1d1d33", color: "#f87171" },
  completed: { bg: "#1f212833", color: "#6b7280" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function ReservationsList() {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("reservations")
    .select("id, start_time, end_time, status, devices(name, halls(name))")
    .eq("user_id", user.id)
    .order("start_time", { ascending: false });

  if (error) {
    return <p className="text-sm" style={{ color: "var(--color-danger)" }}>Failed to load reservations.</p>;
  }

  const rows = (data ?? []) as ReservationRow[];

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="text-4xl mb-3">📅</div>
        <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>You have no reservations yet.</p>
        <Link href="/reservations/new"
          className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "var(--color-primary)", color: "#fff" }}>
          Book a device
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            {["Hall", "Device", "Start", "End", "Status"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS[r.status] ?? STATUS.completed;
            return (
              <tr key={r.id} className="transition-colors"
                style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>{r.devices?.halls?.name ?? "—"}</td>
                <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>{r.devices?.name ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-muted)" }}>{fmt(r.start_time)}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-muted)" }}>{fmt(r.end_time)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                    style={{ background: s.bg, color: s.color }}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-lg"
          style={{ background: "var(--color-surface)" }} />
      ))}
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>My Reservations</h1>
        <Link href="/reservations/new"
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--color-primary)", color: "#fff" }}>
          + New
        </Link>
      </div>
      <Suspense fallback={<Skeleton />}>
        <ReservationsList />
      </Suspense>
    </div>
  );
}

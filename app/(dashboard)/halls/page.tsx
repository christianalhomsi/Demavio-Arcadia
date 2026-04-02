import { Suspense } from "react";
import type { Metadata } from "next";
import { getHalls } from "@/services/halls";
import HallCard from "@/components/ui/hall-card";

export const metadata: Metadata = {
  title: "Halls | Gaming Hub",
};

async function HallsGrid() {
  const halls = await getHalls();

  if (halls.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        No halls available at the moment.
      </p>
    );
  }

  return (
    <div style={grid}>
      {halls.map((hall) => (
        <HallCard key={hall.id} hall={hall} />
      ))}
    </div>
  );
}

function HallsGridSkeleton() {
  return (
    <div style={grid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={skeleton} />
      ))}
    </div>
  );
}

export default function HallsPage() {
  return (
    <div style={page}>
      <h1 style={heading}>Halls</h1>
      <Suspense fallback={<HallsGridSkeleton />}>
        <HallsGrid />
      </Suspense>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: "2rem",
  maxWidth: "1100px",
  margin: "0 auto",
  fontFamily: "system-ui, sans-serif",
};

const heading: React.CSSProperties = {
  margin: "0 0 1.5rem",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#111827",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "1rem",
};

const skeleton: React.CSSProperties = {
  height: "140px",
  borderRadius: "0.75rem",
  background: "#e5e7eb",
  animation: "pulse 1.5s ease-in-out infinite",
};

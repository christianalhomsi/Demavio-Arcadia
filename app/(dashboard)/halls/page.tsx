import { Suspense } from "react";
import type { Metadata } from "next";
import { getHalls } from "@/services/halls";
import HallCard from "@/components/ui/hall-card";

export const metadata: Metadata = { title: "Halls | Gaming Hub" };

async function HallsGrid() {
  const halls = await getHalls();

  if (halls.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">🎮</div>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>No halls available at the moment.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
      {halls.map((hall) => <HallCard key={hall.id} hall={hall} />)}
    </div>
  );
}

function HallsGridSkeleton() {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-36 rounded-xl"
          style={{ background: "var(--color-surface)" }} />
      ))}
    </div>
  );
}

export default function HallsPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Halls</h1>
        <span className="text-xs px-2.5 py-1 rounded-full"
          style={{ background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          Gaming Hub
        </span>
      </div>
      <Suspense fallback={<HallsGridSkeleton />}>
        <HallsGrid />
      </Suspense>
    </div>
  );
}

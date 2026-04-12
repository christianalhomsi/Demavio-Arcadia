import Link from "next/link";
import type { Hall } from "@/types/hall";

export default function HallCard({ hall }: { hall: Hall }) {
  return (
    <div className="flex flex-col gap-4 p-5 rounded-xl border transition-colors"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex-1">
        <p className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>
          {hall.name}
        </p>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          {hall.address ?? "No address provided"}
        </p>
      </div>
      <Link href={`/halls/${hall.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-80"
        style={{ color: "var(--color-primary)" }}>
        View details →
      </Link>
    </div>
  );
}

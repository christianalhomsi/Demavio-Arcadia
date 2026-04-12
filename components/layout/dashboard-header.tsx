import Link from "next/link";

export default function DashboardHeader({ hallName }: { hallName: string }) {
  return (
    <header className="flex items-center gap-3 px-6 h-14 shrink-0 border-b"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <Link href="/halls"
        className="text-sm font-bold tracking-tight shrink-0 transition-opacity hover:opacity-80"
        style={{ color: "var(--color-primary)" }}>
        Gaming<span style={{ color: "var(--color-accent)" }}>Hub</span>
      </Link>
      <span style={{ color: "var(--color-border)" }}>/</span>
      <span className="text-sm truncate" style={{ color: "var(--color-muted)" }}>
        {hallName}
      </span>
    </header>
  );
}

import Link from "next/link";

export default function DashboardHeader({ hallName }: { hallName: string }) {
  return (
    <header style={header}>
      <Link href="/halls" style={logo}>
        Gaming Hub
      </Link>
      <span style={title}>{hallName}</span>
    </header>
  );
}

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  padding: "0 1.5rem",
  height: "56px",
  borderBottom: "1px solid #e5e7eb",
  background: "#fff",
  fontFamily: "system-ui, sans-serif",
};

const logo: React.CSSProperties = {
  fontSize: "0.9375rem",
  fontWeight: 700,
  color: "#111827",
  textDecoration: "none",
  flexShrink: 0,
};

const title: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#6b7280",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

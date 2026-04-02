import Link from "next/link";
import type { Hall } from "@/types/hall";

export default function HallCard({ hall }: { hall: Hall }) {
  return (
    <div style={card}>
      <div style={{ flex: 1 }}>
        <p style={name}>{hall.name}</p>
        <p style={location}>{hall.location ?? "No address provided"}</p>
        <p style={capacity}>{hall.capacity} seats</p>
      </div>
      <Link href={`/halls/${hall.id}`} style={link}>
        View details →
      </Link>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  padding: "1.5rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const name: React.CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "1rem",
  fontWeight: 600,
  color: "#111827",
};

const location: React.CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "0.875rem",
  color: "#6b7280",
};

const capacity: React.CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  color: "#9ca3af",
};

const link: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#111827",
  textDecoration: "none",
  alignSelf: "flex-start",
};

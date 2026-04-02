import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getHalls } from "@/services/halls";
import BookingForm from "./booking-form";

export const metadata: Metadata = { title: "New Reservation | Gaming Hub" };

async function BookingFormLoader() {
  const halls = await getHalls();
  return <BookingForm halls={halls} />;
}

function BookingFormSkeleton() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "0.75rem",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        padding: "2rem",
        width: "100%",
        maxWidth: "480px",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div style={{ ...skel, height: "14px", width: "80px" }} />
          <div style={{ ...skel, height: "38px" }} />
        </div>
      ))}
      <div style={{ ...skel, height: "38px" }} />
    </div>
  );
}

export default function NewReservationPage() {
  return (
    <div style={page}>
      <Link href="/halls" style={backLink}>← Back to halls</Link>
      <h1 style={heading}>New reservation</h1>
      <Suspense fallback={<BookingFormSkeleton />}>
        <BookingFormLoader />
      </Suspense>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: "2rem",
  maxWidth: "600px",
  margin: "0 auto",
  fontFamily: "system-ui, sans-serif",
};

const backLink: React.CSSProperties = {
  display: "inline-block",
  marginBottom: "1.5rem",
  fontSize: "0.875rem",
  color: "#6b7280",
  textDecoration: "none",
};

const heading: React.CSSProperties = {
  margin: "0 0 1.5rem",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#111827",
};

const skel: React.CSSProperties = {
  borderRadius: "0.375rem",
  background: "#e5e7eb",
  width: "100%",
};

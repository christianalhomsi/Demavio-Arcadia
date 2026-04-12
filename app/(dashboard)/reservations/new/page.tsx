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
    <div className="rounded-xl border p-6 w-full max-w-md flex flex-col gap-5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="skeleton h-3 w-20 rounded" style={{ background: "var(--color-surface-2)" }} />
          <div className="skeleton h-10 rounded-lg" style={{ background: "var(--color-surface-2)" }} />
        </div>
      ))}
      <div className="skeleton h-10 rounded-lg" style={{ background: "var(--color-surface-2)" }} />
    </div>
  );
}

export default function NewReservationPage() {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <Link href="/halls"
        className="inline-flex items-center gap-1 text-sm mb-6 transition-opacity hover:opacity-80"
        style={{ color: "var(--color-muted)" }}>
        ← Back to halls
      </Link>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--color-text)" }}>New reservation</h1>
      <Suspense fallback={<BookingFormSkeleton />}>
        <BookingFormLoader />
      </Suspense>
    </div>
  );
}

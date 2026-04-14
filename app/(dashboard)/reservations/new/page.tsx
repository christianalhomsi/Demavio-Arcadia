import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getHalls } from "@/services/halls";
import BookingForm from "./booking-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "New Reservation" };

async function BookingFormLoader() {
  const halls = await getHalls();
  return <BookingForm halls={halls} />;
}

function BookingFormSkeleton() {
  return (
    <div className="space-y-5 p-6 rounded-xl border border-border/60">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-20 skeleton-shimmer" />
          <Skeleton className="h-10 rounded-lg skeleton-shimmer" />
        </div>
      ))}
      <Skeleton className="h-10 rounded-lg skeleton-shimmer" />
    </div>
  );
}

export default function NewReservationPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-5 h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/halls" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}>
            🎮
          </div>
          <span className="text-sm font-bold tracking-tight hidden sm:block">
            <span style={{ color: "oklch(0.55 0.26 280)" }}>Gaming</span>
            <span style={{ color: "oklch(0.82 0.14 200)" }}>Hub</span>
          </span>
        </Link>
        <Separator orientation="vertical" className="h-5 opacity-30" />
        <Link href="/halls" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Halls</Link>
        <span className="text-border text-sm">/</span>
        <Link href="/reservations" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Reservations</Link>
        <span className="text-border text-sm">/</span>
        <span className="text-sm font-medium text-foreground">New</span>
      </header>

      <div className="page-shell max-w-lg">
        <Link href="/halls"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted -ml-2 w-fit">
          ← Back to halls
        </Link>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Reservation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Book a gaming device</p>
        </div>

        <Suspense fallback={<BookingFormSkeleton />}>
          <BookingFormLoader />
        </Suspense>
      </div>
    </div>
  );
}

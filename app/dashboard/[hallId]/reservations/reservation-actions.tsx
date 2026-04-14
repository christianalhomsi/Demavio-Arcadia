"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function ReservationActions({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"confirmed" | "cancelled" | null>(null);

  async function updateStatus(status: "confirmed" | "cancelled") {
    setPending(status);
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Failed to update");
    } else {
      toast.success(status === "confirmed" ? "Reservation confirmed" : "Reservation cancelled");
      router.refresh();
    }
    setPending(null);
  }

  return (
    <div className="flex gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs border-green-500/40 text-green-600 hover:bg-green-500/10"
        disabled={!!pending}
        onClick={() => updateStatus("confirmed")}
      >
        {pending === "confirmed" ? "..." : "Confirm"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={!!pending}
        onClick={() => updateStatus("cancelled")}
      >
        {pending === "cancelled" ? "..." : "Cancel"}
      </Button>
    </div>
  );
}

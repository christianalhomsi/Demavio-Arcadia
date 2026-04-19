"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

export default function ReservationActions({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const t = useTranslations("dashboard");
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
      toast.error(typeof data.error === "string" ? data.error : t("failedToUpdate"));
    } else {
      toast.success(status === "confirmed" ? t("reservationConfirmed") : t("reservationCancelled"));
      router.refresh();
    }
    setPending(null);
  }

  return (
    <div className="flex gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs border-green-500/40 text-green-500 hover:bg-green-500/10 hover:text-green-400"
        disabled={!!pending}
        onClick={() => updateStatus("confirmed")}
      >
        {pending === "confirmed" ? (
          <span className="w-3 h-3 rounded-full border-2 border-green-500/40 border-t-green-500 animate-spin" />
        ) : (
          <Check size={13} />
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={!!pending}
        onClick={() => updateStatus("cancelled")}
      >
        {pending === "cancelled" ? (
          <span className="w-3 h-3 rounded-full border-2 border-destructive/40 border-t-destructive animate-spin" />
        ) : (
          <X size={13} />
        )}
      </Button>
    </div>
  );
}

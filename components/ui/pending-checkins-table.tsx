"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Check, X, Clock } from "lucide-react";

type PendingCheckIn = {
  id: string;
  start_time: string;
  end_time: string;
  guest_name: string | null;
  user_id: string | null;
  device_id: string;
  devices: { name: string } | null;
  email?: string;
};

export default function PendingCheckInsTable({
  checkIns,
  hallId,
}: {
  checkIns: PendingCheckIn[];
  hallId: string;
}) {
  const t = useTranslations("devices");
  const [items, setItems] = useState(checkIns);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleCheckIn(reservation: PendingCheckIn) {
    setLoading(reservation.id);
    const res = await fetch("/api/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_id: reservation.id,
        device_id: reservation.device_id,
        hall_id: hallId,
      }),
    });
    setLoading(null);

    if (res.ok) {
      setItems((prev) => prev.filter((r) => r.id !== reservation.id));
      toast.success(t("sessionStarted"));
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error ?? t("checkInFailed"));
    }
  }

  async function handleCancel(reservationId: string) {
    setLoading(reservationId);
    const res = await fetch(`/api/reservations/${reservationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setLoading(null);

    if (res.ok) {
      setItems((prev) => prev.filter((r) => r.id !== reservationId));
      toast.success("Reservation cancelled");
    } else {
      toast.error("Failed to cancel");
    }
  }

  if (items.length === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/15 border border-amber-500/30">
            <Clock size={16} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-amber-400">
              {t("confirmedReservation")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {items.length} waiting for check-in
            </p>
          </div>
        </div>
      </CardHeader>
      <Separator className="opacity-40" />
      <CardContent className="pt-4">
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-amber-500/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {item.devices?.name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.guest_name || item.email || "—"} •{" "}
                  {new Date(item.start_time).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 cursor-pointer"
                  style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                  onClick={() => handleCheckIn(item)}
                  disabled={loading === item.id}
                >
                  <Check size={16} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 cursor-pointer border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => handleCancel(item.id)}
                  disabled={loading === item.id}
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

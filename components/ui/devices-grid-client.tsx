"use client";

import { useState, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Device } from "@/services/devices";
import type { DeviceType } from "@/types/device-type";
import StaffDeviceCard, { type StaffDeviceCardProps } from "@/components/ui/staff-device-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monitor, Layers } from "lucide-react";

type DeviceWithType = Device & { device_type?: DeviceType };

type Props = {
  devices: DeviceWithType[];
  deviceTypes: DeviceType[];
  sessions: { id: string; device_id: string; started_at: string; user_id: string | null; guest_name: string | null }[];
  reservations: { id: string; device_id: string }[];
  hallId: string;
};

export default function DevicesGridClient({ devices, deviceTypes, sessions, reservations, hallId }: Props) {
  const locale = useLocale();
  const t = useTranslations("devices");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const sessionByDevice = useMemo(() => new Map(sessions.map((s) => [s.device_id, s])), [sessions]);
  const reservationByDevice = useMemo(() => new Map(reservations.map((r) => [r.device_id, r])), [reservations]);

  // Filter devices by selected type
  const filteredDevices = useMemo(() => {
    if (!selectedTypeId) return devices;
    return devices.filter(d => d.device_type?.id === selectedTypeId);
  }, [devices, selectedTypeId]);

  const cards: StaffDeviceCardProps[] = useMemo(() => 
    filteredDevices.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      hallId,
      activeSession: sessionByDevice.get(d.id)
        ? { 
            id: sessionByDevice.get(d.id)!.id, 
            started_at: sessionByDevice.get(d.id)!.started_at,
            user_id: sessionByDevice.get(d.id)!.user_id,
            guest_name: sessionByDevice.get(d.id)!.guest_name
          }
        : null,
      pendingReservation: reservationByDevice.get(d.id)
        ? { id: reservationByDevice.get(d.id)!.id }
        : null,
    })),
    [filteredDevices, hallId, sessionByDevice, reservationByDevice]
  );

  if (devices.length === 0) {
    return (
      <Card className="border-border/60 border-dashed">
        <CardContent className="py-20 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "2px dashed oklch(0.55 0.26 280 / 0.3)" }}
          >
            <Monitor size={32} style={{ color: "oklch(0.65 0.22 280)" }} className="opacity-50" />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">{t("noDevices")}</p>
          <p className="text-sm text-muted-foreground">{t("noDevicesAdded")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Device Type Filter */}
      {deviceTypes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">{t("deviceType")}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={selectedTypeId === null ? "default" : "outline"}
              onClick={() => setSelectedTypeId(null)}
              className="cursor-pointer"
              style={selectedTypeId === null ? { background: "oklch(0.55 0.26 280)", color: "white" } : {}}
            >
              {t("all")} ({devices.length})
            </Button>
            {deviceTypes.map((type) => {
              const count = devices.filter(d => d.device_type?.id === type.id).length;
              const isSelected = selectedTypeId === type.id;
              return (
                <Button
                  key={type.id}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => setSelectedTypeId(type.id)}
                  className="cursor-pointer"
                  style={isSelected ? { background: "oklch(0.55 0.26 280)", color: "white" } : {}}
                >
                  {locale === "ar" ? type.name_ar : type.name_en} ({count})
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Devices Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {selectedTypeId 
              ? `${deviceTypes.find(t => t.id === selectedTypeId)?.[locale === "ar" ? "name_ar" : "name_en"]} (${cards.length})`
              : `${t("allDevices")} (${cards.length})`
            }
          </h2>
        </div>
        
        {cards.length === 0 ? (
          <Card className="border-border/60 border-dashed">
            <CardContent className="py-12 text-center">
              <Monitor size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">{t("noDevicesOfType")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {cards.map((props) => (
              <StaffDeviceCard key={props.id} {...props} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

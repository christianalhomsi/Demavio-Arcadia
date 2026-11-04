"use client";

import { Wifi, WifiOff, Wrench, Ban, CircleCheck, Minus, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import type { DeviceStatus } from "../queries";

/**
 * Five state dimensions stay visibly separate (spec §7.3): operational, maintenance, Agent
 * connectivity. Session and reservation state are shown on the device card and detail.
 * Status is always conveyed by text and icon, never color alone.
 */
export function AvailabilityBadge({ value }: { value: DeviceStatus["effectiveAvailability"] }) {
  const { t } = useI18n();
  if (value === "available") {
    return (
      <Badge tone="success">
        <CircleCheck className="me-1 h-3 w-3" aria-hidden /> {t.ovAvailable}
      </Badge>
    );
  }
  if (value === "in_use") {
    return (
      <Badge tone="info">
        <Play className="me-1 h-3 w-3" aria-hidden /> {t.ovInUse}
      </Badge>
    );
  }
  if (value === "maintenance") {
    return (
      <Badge tone="warning">
        <Wrench className="me-1 h-3 w-3" aria-hidden /> {t.ovMaintenance}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <Ban className="me-1 h-3 w-3" aria-hidden /> {t.statusDisabled}
    </Badge>
  );
}

export function AgentBadge({ value }: { value: DeviceStatus["agentStatus"] }) {
  const { t } = useI18n();
  if (value === "online") {
    return (
      <Badge tone="success">
        <Wifi className="me-1 h-3 w-3" aria-hidden /> {t.dvAgentOnline}
      </Badge>
    );
  }
  if (value === "offline") {
    return (
      <Badge tone="danger">
        <WifiOff className="me-1 h-3 w-3" aria-hidden /> {t.fAgentOffline}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <Minus className="me-1 h-3 w-3" aria-hidden /> {t.dvNoAgent}
    </Badge>
  );
}

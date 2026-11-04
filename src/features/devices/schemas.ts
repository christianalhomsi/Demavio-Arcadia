import { z } from "zod";
import type { Messages } from "@/lib/i18n/messages";

export const DEVICE_TYPES = ["pc", "console"] as const;
/**
 * The kinds of device a hall can add. The value is stored as the device category, so pricing rules,
 * player-count rates and bookings keep matching it by name. Only PCs run an Agent; everything else is
 * stored as a console (no remote lock/unlock).
 */
export const DEVICE_CATEGORIES = [
  "PC",
  "PlayStation 4",
  "PlayStation 5",
  "Billiards",
  "Ping Pong",
] as const;

/** Kinds that are usually priced by the number of players (2 or 4). */
export const PLAYER_PRICED_CATEGORIES: readonly string[] = [
  "PlayStation 4",
  "PlayStation 5",
  "Billiards",
  "Ping Pong",
];

export function deviceTypeForCategory(category: string): (typeof DEVICE_TYPES)[number] | null {
  if (category === "PC") return "pc";
  return (DEVICE_CATEGORIES as readonly string[]).includes(category) ? "console" : null;
}

export const CAPABILITIES = ["lock", "unlock", "shutdown", "restart"] as const;

export const deviceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "At most 40 characters"),
  deviceType: z.enum(DEVICE_TYPES),
  category: z.string().trim().max(40, "At most 40 characters"),
  capabilities: z.array(z.enum(CAPABILITIES)),
  status: z.enum(["active", "disabled"]),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export const maintenanceSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(300, "At most 300 characters"),
  /** ISO timestamp or empty. */
  expectedEnd: z.string(),
});
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

/**
 * Commands staff may request. START_SESSION / END_SESSION are issued by the session flows, and
 * arbitrary commands do not exist (spec §15.2).
 */
export const STAFF_COMMANDS = ["LOCK", "UNLOCK", "SHUTDOWN", "RESTART", "SYNC_STATE"] as const;
export type StaffCommand = (typeof STAFF_COMMANDS)[number];

export const COMMAND_INFO: Record<
  StaffCommand,
  { label: string; capability: (typeof CAPABILITIES)[number] | null; destructive: boolean }
> = {
  LOCK: { label: "Lock screen", capability: "lock", destructive: false },
  UNLOCK: { label: "Unlock screen", capability: "unlock", destructive: false },
  SHUTDOWN: { label: "Shut down", capability: "shutdown", destructive: true },
  RESTART: { label: "Restart", capability: "restart", destructive: true },
  SYNC_STATE: { label: "Sync state", capability: null, destructive: false },
};

export function availableCommands(capabilities: readonly string[]): StaffCommand[] {
  return STAFF_COMMANDS.filter((c) => {
    const cap = COMMAND_INFO[c].capability;
    return cap === null || capabilities.includes(cap);
  });
}

/** Dictionary key of each command's label (COMMAND_INFO.label stays the English fallback). */
export const COMMAND_KEYS: Record<StaffCommand, keyof Messages> = {
  LOCK: "cmdLock",
  UNLOCK: "cmdUnlock",
  SHUTDOWN: "cmdShutdown",
  RESTART: "cmdRestart",
  SYNC_STATE: "cmdSync",
};

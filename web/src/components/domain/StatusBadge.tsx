"use client";

import { Badge, type Tone } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Status vocabularies come from the spec (§9.3 sessions, §11.1 invoices, §15.4 commands).
 * Unknown values render neutrally with their raw label instead of failing.
 */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  // sessions
  Starting: { label: "Starting", tone: "info" },
  InProgress: { label: "In progress", tone: "success" },
  Ending: { label: "Ending", tone: "info" },
  Completed: { label: "Completed", tone: "neutral" },
  Interrupted: { label: "Interrupted", tone: "warning" },
  Canceled: { label: "Canceled", tone: "neutral" },
  // invoices
  Draft: { label: "Draft", tone: "neutral" },
  Open: { label: "Open", tone: "warning" },
  PartiallyPaid: { label: "Partially paid", tone: "warning" },
  Paid: { label: "Paid", tone: "success" },
  Voided: { label: "Voided", tone: "neutral" },
  WrittenOff: { label: "Written off", tone: "neutral" },
  // agent commands (timeout is NOT failure: outcome unknown, spec §15.4)
  Queued: { label: "Queued", tone: "neutral" },
  Sent: { label: "Sent", tone: "info" },
  Acknowledged: { label: "Acknowledged", tone: "info" },
  Executed: { label: "Executed", tone: "success" },
  Failed: { label: "Failed", tone: "danger" },
  TimedOut: { label: "Outcome unknown", tone: "warning" },
};

/** Dictionary key of each known status; the English label above stays the fallback. */
const MSG: Record<string, keyof Messages> = {
  Starting: "sbStarting",
  InProgress: "sbInProgress",
  Ending: "sbEnding",
  Completed: "sbCompleted",
  Interrupted: "sbInterrupted",
  Canceled: "sbCanceled",
  Draft: "sbDraft",
  Open: "sbOpen",
  PartiallyPaid: "sbPartiallyPaid",
  Paid: "sbPaid",
  Voided: "sbVoided",
  WrittenOff: "sbWrittenOff",
  Queued: "sbQueued",
  Sent: "sbSent",
  Acknowledged: "sbAcknowledged",
  Executed: "sbExecuted",
  Failed: "sbFailed",
  TimedOut: "sbTimedOut",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const entry = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  const key = MSG[status];
  return <Badge tone={entry.tone}>{key ? t[key] : entry.label}</Badge>;
}

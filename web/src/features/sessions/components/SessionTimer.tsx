"use client";

import * as React from "react";
import { formatDuration } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";

/**
 * Display-only timer. It is derived from server timestamps and corrected for the browser's clock
 * skew; it never decides when a session ends (the backend owns timing, spec §22).
 */
export function SessionTimer({
  startedAt,
  endsAt,
  serverNow,
}: {
  startedAt: string;
  endsAt: string | null;
  /** Server clock when the page was rendered. */
  serverNow: string;
}) {
  const { t } = useI18n();
  const [skew] = React.useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = React.useState(() => Date.now() + skew);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(id);
  }, [skew]);

  if (endsAt === null) {
    return (
      <span className="tabular-nums">
        <span className="sr-only">{t.ssElapsed} </span>
        {formatDuration(now - Date.parse(startedAt))}
      </span>
    );
  }
  const remaining = Date.parse(endsAt) - now;
  if (remaining <= 0) {
    return (
      <span className="font-medium text-danger">
        {t.ssTimeUp} <span className="tabular-nums">(+{formatDuration(-remaining)})</span>
      </span>
    );
  }
  return (
    <span
      className={remaining < 300_000 ? "font-semibold tabular-nums text-warning" : "tabular-nums"}
    >
      <span className="sr-only">{t.ssRemaining} </span>
      {formatDuration(remaining)}
    </span>
  );
}

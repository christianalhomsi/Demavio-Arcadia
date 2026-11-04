"use client";

import { useHallRealtime } from "./useHallRealtime";

/** Drop into any server-rendered page to keep it fresh; shows a notice if live updates pause. */
export function LiveRefresh({ hallId, tables }: { hallId: string; tables: readonly string[] }) {
  const live = useHallRealtime(hallId, tables);
  if (live) return null;
  return (
    <p role="status" className="rounded-md bg-warning-bg p-2 text-sm text-warning">
      Live updates paused. Refreshing periodically.
    </p>
  );
}

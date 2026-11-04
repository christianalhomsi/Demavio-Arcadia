"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 300;

/**
 * Keeps a server-rendered page fresh. Realtime events are only a hint: on any change (and after
 * every reconnect) the page refetches authorized state from the server, so a missed or forged event
 * can never change what is shown (spec §17.1). While the channel is down it falls back to polling.
 *
 * Returns whether live updates are currently connected.
 */
export function useHallRealtime(
  hallId: string,
  tables: readonly string[],
  pollMs = 15_000,
): boolean {
  const router = useRouter();
  const [connected, setConnected] = React.useState(true);
  const tablesKey = tables.join(",");
  // Keep the latest refresh without making it an effect dependency: re-subscribing on every render
  // would drop the pending debounce and the reconnect state.
  const refreshRef = React.useRef(router.refresh);
  React.useEffect(() => {
    refreshRef.current = router.refresh;
  });

  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasDown = false;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), DEBOUNCE_MS);
    };

    // A name of its own for every subscription: the client hands back an existing channel of the same
    // name, and one that is still being removed (React strict mode, or moving between pages that watch
    // the same tables) would refuse the new callbacks and crash the page.
    const channel = supabase.channel(`hall:${hallId}:${tablesKey}:${crypto.randomUUID()}`);
    for (const table of tablesKey.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `hall_id=eq.${hallId}` },
        refresh,
      );
    }
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        // Events may have been missed while disconnected: refetch current state.
        if (wasDown) refresh();
        wasDown = false;
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        wasDown = true;
        setConnected(false);
      }
    });

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [hallId, tablesKey]);

  React.useEffect(() => {
    if (connected) return;
    const id = setInterval(() => refreshRef.current(), pollMs);
    return () => clearInterval(id);
  }, [connected, pollMs]);

  return connected;
}

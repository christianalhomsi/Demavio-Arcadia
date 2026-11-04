import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

type Handler = () => void;
const handlers: Handler[] = [];
let statusCb: (s: string) => void = () => {};
const channel = {
  on: vi.fn((_t: string, _f: unknown, h: Handler) => {
    handlers.push(h);
    return channel;
  }),
  subscribe: vi.fn((cb: (s: string) => void) => {
    statusCb = cb;
    return channel;
  }),
};
const removeChannel = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: () => channel, removeChannel }),
}));

import { useHallRealtime } from "./useHallRealtime";

function Probe() {
  const connected = useHallRealtime("hall-1", ["devices", "agents"], 1000);
  return <p>{connected ? "live" : "paused"}</p>;
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  handlers.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("useHallRealtime", () => {
  it("subscribes to each table scoped to the hall", () => {
    render(<Probe />);
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "devices", filter: "hall_id=eq.hall-1" }),
      expect.any(Function),
    );
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "agents" }),
      expect.any(Function),
    );
  });

  it("refetches (debounced) instead of trusting the event payload", () => {
    render(<Probe />);
    handlers[0]!();
    handlers[0]!();
    handlers[1]!();
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(400));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("falls back to polling when disconnected and refetches after reconnect", () => {
    render(<Probe />);
    act(() => statusCb("CHANNEL_ERROR"));
    expect(screen.getByText("paused")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2100));
    expect(refresh).toHaveBeenCalledTimes(2); // polling

    refresh.mockClear();
    act(() => statusCb("SUBSCRIBED"));
    expect(screen.getByText("live")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(400));
    expect(refresh).toHaveBeenCalledTimes(1); // catch-up refetch for missed events
    act(() => void vi.advanceTimersByTime(5000));
    expect(refresh).toHaveBeenCalledTimes(1); // polling stopped
  });

  it("cleans up the channel on unmount", () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});

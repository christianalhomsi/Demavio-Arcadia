import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/components/domain/PermissionGate";
import type { ReservationRow } from "@/features/reservations/queries";
import { DayCalendar } from "@/features/reservations/components/DayCalendar";
import { dayWindow } from "@/lib/dayWindow";
import type { SessionRow } from "../queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/realtime/useHallRealtime", () => ({ useHallRealtime: () => true }));
const startWalkIn = vi.fn();
vi.mock("../actions", () => ({
  startWalkInAction: (...a: unknown[]) => startWalkIn(...a),
  endSessionAction: vi.fn(),
  extendSessionAction: vi.fn(),
  convertToOpenAction: vi.fn(),
}));

import { WalkInDialog } from "./SessionDialogs";
import { SessionsBoard } from "./SessionsBoard";
import { SessionTimer } from "./SessionTimer";

describe("SessionTimer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down using the server clock, not the browser clock", () => {
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z")); // browser clock
    // The server says it is 10 minutes later than the browser thinks.
    render(
      <SessionTimer
        startedAt="2026-01-01T12:00:00Z"
        endsAt="2026-01-01T13:00:00Z"
        serverNow="2026-01-01T12:10:00Z"
      />,
    );
    expect(screen.getByText(/0:50:00/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByText(/0:49:55/)).toBeInTheDocument();
  });
  it("shows elapsed time for open sessions and 'Time is up' once overdue", () => {
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const { rerender } = render(
      <SessionTimer
        startedAt="2026-01-01T11:00:00Z"
        endsAt={null}
        serverNow="2026-01-01T12:00:00Z"
      />,
    );
    expect(screen.getByText(/1:00:00/)).toBeInTheDocument();
    rerender(
      <SessionTimer
        startedAt="2026-01-01T11:00:00Z"
        endsAt="2026-01-01T11:50:00Z"
        serverNow="2026-01-01T12:00:00Z"
      />,
    );
    expect(screen.getByText(/Time is up/)).toBeInTheDocument();
  });
});

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1",
  deviceId: "d1",
  deviceName: "PC-01",
  customerName: "Sam",
  type: "fixed",
  status: "in_progress",
  startedAt: "2026-01-01T11:30:00Z",
  scheduledEndAt: "2026-01-01T12:30:00Z",
  endedAt: null,
  endType: null,
  billableSeconds: null,
  extensionCount: 0,
  reservationId: null,
  ...over,
});

describe("SessionsBoard", () => {
  it("hides actions the user lacks permission for (UX only)", () => {
    render(
      <PermissionProvider permissions={["session.start"]}>
        <SessionsBoard
          hallId="h"
          sessions={[session()]}
          devices={[]}
          serverNow="2026-01-01T12:00:00Z"
        />
      </PermissionProvider>,
    );
    expect(screen.queryByRole("button", { name: "End" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Extend" })).not.toBeInTheDocument();
  });
  it("offers Extend/Make open only for fixed sessions", () => {
    render(
      <PermissionProvider permissions={["session.start", "session.end", "session.extend"]}>
        <SessionsBoard
          hallId="h"
          sessions={[
            session(),
            session({ id: "s2", deviceName: "PC-02", type: "open", scheduledEndAt: null }),
          ]}
          devices={[]}
          serverNow="2026-01-01T12:00:00Z"
        />
      </PermissionProvider>,
    );
    expect(screen.getAllByRole("button", { name: "Extend" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "End" })).toHaveLength(2);
  });
  it("shows an empty state", () => {
    render(
      <PermissionProvider permissions={["session.start"]}>
        <SessionsBoard hallId="h" sessions={[]} devices={[]} serverNow="2026-01-01T12:00:00Z" />
      </PermissionProvider>,
    );
    expect(screen.getByRole("heading", { name: "No active sessions" })).toBeInTheDocument();
  });
});

describe("WalkInDialog", () => {
  it("lists only free devices and reuses one idempotency key across retries", async () => {
    startWalkIn.mockResolvedValueOnce({
      ok: false,
      code: "CONFLICT",
      message: "The device is in use during that time.",
    });
    startWalkIn.mockResolvedValueOnce({ ok: true, data: { sessionId: "s" } });
    const onDone = vi.fn();
    render(
      <PermissionProvider permissions={["session.start"]}>
        <WalkInDialog
          hallId="h"
          onDone={onDone}
          devices={[
            { id: "11111111-1111-4111-8111-111111111111", name: "PC-01", available: true },
            { id: "22222222-2222-4222-8222-222222222222", name: "PC-02", available: false },
          ]}
        />
      </PermissionProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start walk-in" }));
    expect(screen.getByRole("option", { name: "PC-01" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "PC-02" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Customer name"), "Sam");
    await userEvent.click(screen.getByRole("button", { name: "Start session" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("in use");
    await userEvent.click(screen.getByRole("button", { name: "Start session" }));

    const keys = startWalkIn.mock.calls.map((c) => c[2]);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]); // a retry of the same intent reuses the key
    expect(onDone).toHaveBeenCalled();
  });
  it("renders nothing without session.start", () => {
    render(
      <PermissionProvider permissions={[]}>
        <WalkInDialog hallId="h" devices={[]} onDone={() => {}} />
      </PermissionProvider>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("DayCalendar", () => {
  const window = dayWindow("2026-10-24", "UTC");
  const reservation = (over: Partial<ReservationRow>): ReservationRow => ({
    id: "r1",
    deviceId: "d1",
    deviceName: "PC-01",
    customerName: "Sam",
    status: "confirmed",
    startAt: "2026-10-24T10:00:00Z",
    endAt: "2026-10-24T12:00:00Z",
    sessionId: null,
    cancelReason: null,
    playersCount: null,
    ...over,
  });

  it("renders accessible, linked blocks and hides canceled reservations", () => {
    render(
      <DayCalendar
        hallId="h"
        timeZone="UTC"
        window={window}
        devices={[
          { id: "d1", name: "PC-01" },
          { id: "d2", name: "PC-02" },
        ]}
        reservations={[
          reservation({}),
          reservation({ id: "r2", status: "canceled", customerName: "Gone" }),
        ]}
        sessions={[
          session({ startedAt: "2026-10-24T10:05:00Z", scheduledEndAt: "2026-10-24T11:00:00Z" }),
        ]}
        now={new Date("2026-10-24T09:00:00Z")}
      />,
    );
    const link = screen.getByRole("link", { name: /Reservation Confirmed, Sam, 10:00 to 12:00/ });
    expect(link).toHaveAttribute("href", "/halls/h/reservations/r1");
    expect(screen.queryByText(/Gone/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Session fixed, started 10:05, running/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "PC-02 timeline" })).toBeInTheDocument();
  });
});

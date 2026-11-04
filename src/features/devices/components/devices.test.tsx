import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/components/domain/PermissionGate";
import type { DeviceStatus } from "../queries";
import { availableCommands } from "../schemas";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/realtime/useHallRealtime", () => ({ useHallRealtime: () => true }));
vi.mock("../actions", () => ({
  requestCommandAction: vi.fn(),
  startMaintenanceAction: vi.fn(),
  endMaintenanceAction: vi.fn(),
  upsertDeviceAction: vi.fn(),
}));

import { DeviceActions } from "./DeviceActions";
import { DeviceGrid, matchesFilter } from "./DeviceGrid";

const base: DeviceStatus = {
  deviceId: "44444444-0000-0000-0000-000000000001",
  hallId: "h",
  name: "PC-01",
  deviceType: "pc",
  category: "Standard",
  capabilities: ["lock", "unlock", "shutdown", "restart"],
  operationalStatus: "active",
  maintenanceStatus: "none",
  maintenanceId: null,
  maintenanceReason: null,
  maintenanceExpectedEnd: null,
  agentId: "a",
  agentVersion: "1.0.0",
  lastHeartbeatAt: null,
  agentSyncState: "synced",
  agentLastError: null,
  agentStatus: "online",
  effectiveAvailability: "available",
  currentSessionId: null,
  currentSessionType: null,
  currentSessionStartedAt: null,
  currentSessionEndsAt: null,
  nextReservationAt: null,
};
const devices: DeviceStatus[] = [
  base,
  { ...base, deviceId: "2", name: "PC-02", agentStatus: "offline" },
  {
    ...base,
    deviceId: "3",
    name: "Console-01",
    effectiveAvailability: "maintenance",
    maintenanceStatus: "in_maintenance",
    maintenanceReason: "Cable",
    agentStatus: "none",
  },
];

describe("DeviceGrid", () => {
  it("shows availability and Agent state as separate, text-labelled indicators", () => {
    render(
      <PermissionProvider permissions={["device.view"]}>
        <DeviceGrid hallId="h" devices={devices} />
      </PermissionProvider>,
    );
    expect(screen.getAllByText("Agent offline").length).toBeGreaterThan(1); // filter button + badge
    expect(screen.getByText("No Agent")).toBeInTheDocument();
    expect(screen.getByText("Maintenance: Cable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add device" })).not.toBeInTheDocument();
  });
  it("filters by state and by search", async () => {
    render(
      <PermissionProvider permissions={["device.view", "hall.settings.manage"]}>
        <DeviceGrid hallId="h" devices={devices} />
      </PermissionProvider>,
    );
    expect(screen.getByRole("link", { name: "Add device" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Agent offline/ }));
    expect(screen.getByText("PC-02")).toBeInTheDocument();
    expect(screen.queryByText("PC-01")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^All/ }));
    await userEvent.type(screen.getByLabelText("Search devices"), "console");
    expect(screen.getByText("Console-01")).toBeInTheDocument();
    expect(screen.queryByText("PC-01")).not.toBeInTheDocument();
  });
  it("renders an empty state with no devices", () => {
    render(
      <PermissionProvider permissions={[]}>
        <DeviceGrid hallId="h" devices={[]} />
      </PermissionProvider>,
    );
    expect(screen.getByRole("heading", { name: "No devices yet" })).toBeInTheDocument();
  });
  it("matchesFilter uses the backend-provided availability", () => {
    expect(matchesFilter(devices[2]!, "maintenance")).toBe(true);
    expect(matchesFilter(devices[2]!, "available")).toBe(false);
  });
});

describe("DeviceActions", () => {
  it("shows nothing without device.control (UX only; the backend enforces)", () => {
    render(
      <PermissionProvider permissions={["device.view"]}>
        <DeviceActions hallId="h" device={base} />
      </PermissionProvider>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("offers only supported commands and disables them with no Agent", () => {
    render(
      <PermissionProvider permissions={["device.control"]}>
        <DeviceActions
          hallId="h"
          device={{ ...base, capabilities: ["lock"], agentStatus: "none" }}
        />
      </PermissionProvider>,
    );
    expect(screen.getByRole("button", { name: "Lock screen" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Restart" })).not.toBeInTheDocument();
    expect(screen.getByText(/need an Agent/)).toBeInTheDocument();
  });
  it("requires typed confirmation for destructive commands", async () => {
    render(
      <PermissionProvider permissions={["device.control"]}>
        <DeviceActions hallId="h" device={base} />
      </PermissionProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Shut down" }));
    const confirm = screen.getAllByRole("button", { name: "Shut down" }).at(-1)!;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type SHUTDOWN/), "SHUTDOWN");
    expect(confirm).toBeEnabled();
  });
  it("warns that commands to an offline Agent are only queued", () => {
    render(
      <PermissionProvider permissions={["device.control"]}>
        <DeviceActions hallId="h" device={{ ...base, agentStatus: "offline" }} />
      </PermissionProvider>,
    );
    expect(screen.getByText(/queued and may not run/)).toBeInTheDocument();
  });
});

describe("availableCommands", () => {
  it("derives commands from capabilities; SYNC_STATE is always available", () => {
    expect(availableCommands([])).toEqual(["SYNC_STATE"]);
    expect(availableCommands(["lock", "restart"])).toEqual(["LOCK", "RESTART", "SYNC_STATE"]);
  });
});

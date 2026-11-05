import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/components/domain/PermissionGate";

const setHours = vi.fn();
vi.mock("../actions", () => ({
  setWorkingHoursAction: (...a: unknown[]) => setHours(...a),
  updateHallProfileAction: vi.fn(),
  updatePoliciesAction: vi.fn(),
}));

import { WorkingHoursEditor } from "./SettingsForms";

const withPerms = (perms: "hall.settings.manage"[], ui: React.ReactNode) => (
  <PermissionProvider permissions={perms}>{ui}</PermissionProvider>
);

describe("WorkingHoursEditor", () => {
  it("blocks saving overlapping ranges and shows why", async () => {
    render(
      withPerms(
        ["hall.settings.manage"],
        <WorkingHoursEditor
          hallId="h"
          initial={[
            { weekday: 1, opens: "09:00", closes: "12:00" },
            { weekday: 1, opens: "11:00", closes: "15:00" },
          ]}
        />,
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("overlap");
    expect(screen.getByRole("button", { name: "Save hours" })).toBeDisabled();
  });

  it("submits valid hours", async () => {
    setHours.mockResolvedValue({ ok: true, data: null });
    render(
      withPerms(
        ["hall.settings.manage"],
        <WorkingHoursEditor
          hallId="h"
          initial={[{ weekday: 1, opens: "09:00", closes: "17:00" }]}
        />,
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(setHours).toHaveBeenCalledWith("h", [{ weekday: 1, opens: "09:00", closes: "17:00" }]);
    expect(await screen.findByRole("status")).toHaveTextContent("saved");
  });

  it("is read-only without hall.settings.manage", () => {
    render(
      withPerms(
        [],
        <WorkingHoursEditor
          hallId="h"
          initial={[{ weekday: 1, opens: "09:00", closes: "17:00" }]}
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: "Save hours" })).not.toBeInTheDocument();
    // The time field is a group of two lists (hour, minute); both are disabled.
    for (const list of within(screen.getByRole("group", { name: "Opens" })).getAllByRole(
      "combobox",
    ))
      expect(list).toBeDisabled();
  });
});

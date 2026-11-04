import { describe, expect, it } from "vitest";
import { HALL_NAV, filterNav } from "./nav";

const labels = (g: ReturnType<typeof filterNav>) => g.flatMap((x) => x.items.map((i) => i.label));

describe("filterNav", () => {
  it("shows only permitted items and drops empty groups", () => {
    const groups = filterNav(HALL_NAV, ["device.view", "invoice.view"]);
    expect(labels(groups)).toEqual([
      "Overview",
      "Devices",
      "Agents",
      "Commands",
      "Invoices",
      "My activity",
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Operations", "Finance", "Account"]);
  });
  it("shows only the self-service page without permissions (it lists the caller's own actions)", () => {
    expect(labels(filterNav(HALL_NAV, []))).toEqual(["My activity"]);
  });
});

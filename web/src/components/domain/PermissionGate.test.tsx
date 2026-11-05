import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PermissionGate, PermissionProvider } from "./PermissionGate";

describe("PermissionGate", () => {
  it("renders children when the permission is held", () => {
    render(
      <PermissionProvider permissions={["payment.collect"]}>
        <PermissionGate permission="payment.collect">
          <button>Collect</button>
        </PermissionGate>
      </PermissionProvider>,
    );
    expect(screen.getByRole("button", { name: "Collect" })).toBeInTheDocument();
  });
  it("renders the fallback (or nothing) otherwise", () => {
    render(
      <PermissionProvider permissions={["payment.collect"]}>
        <PermissionGate permission="refund.approve" fallback={<span>No access</span>}>
          <button>Approve</button>
        </PermissionGate>
        <PermissionGate permission="wallet.withdraw">
          <button>Withdraw</button>
        </PermissionGate>
      </PermissionProvider>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("No access")).toBeInTheDocument();
  });
  it("denies everything without a provider (fails closed)", () => {
    render(
      <PermissionGate permission="device.view">
        <span>secret</span>
      </PermissionGate>,
    );
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/data/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { Forbidden } from "./Forbidden";
import { Money } from "./Money";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("labels command timeout as unknown outcome, not failure", () => {
    render(<StatusBadge status="TimedOut" />);
    expect(screen.getByText("Outcome unknown")).toBeInTheDocument();
  });
  it("renders unknown statuses neutrally", () => {
    render(<StatusBadge status="Mystery" />);
    expect(screen.getByText("Mystery")).toBeInTheDocument();
  });
});

describe("Money", () => {
  it("uses the record's currency", () => {
    render(<Money minor={1250} currency="USD" />);
    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });
});

describe("EmptyState and Forbidden", () => {
  it("render accessible content", () => {
    render(
      <>
        <EmptyState title="No devices" description="Add one" />
        <Forbidden />
      </>,
    );
    expect(screen.getByRole("heading", { name: "No devices" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
  });
});

describe("ConfirmDialog", () => {
  it("blocks confirmation until a reason is entered", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Override check-in"
        requireReason
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Reason"), "Customer was delayed");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("Customer was delayed");
  });
  it("requires typed confirmation", async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Shut down"
        typedConfirmation="SHUTDOWN"
        onConfirm={() => {}}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type SHUTDOWN/), "SHUTDOWN");
    expect(confirm).toBeEnabled();
  });
});

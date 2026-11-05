import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/components/domain/PermissionGate";
import type { Permission } from "@/contracts/permissions";
import { ReportView } from "@/features/reports/components/ReportView";
import type { FinancialSummary } from "@/features/reports/queries";
import type { ShiftRow, UnpaidInvoiceRow } from "../queries";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
const closeAction = vi.fn();
const openAction = vi.fn();
vi.mock("../actions", () => ({
  closeShiftAction: (...a: unknown[]) => closeAction(...a),
  openShiftAction: (...a: unknown[]) => openAction(...a),
  recordCashMovementAction: vi.fn(),
}));

import { CloseShiftStepper } from "./CloseShiftStepper";
import { ShiftsPanel } from "./ShiftsPanel";

const shift: ShiftRow = {
  id: "s1",
  registerId: "r1",
  registerName: "Main register",
  status: "open",
  currency: "USD",
  openedByName: "Sam",
  openedAt: "2026-10-26T08:00:00Z",
  openingCashMinor: 1000,
  closedByName: null,
  closedAt: null,
  countedCashMinor: null,
  expectedCashMinor: 1300,
  differenceMinor: null,
  overrideReason: null,
  unpaidCount: null,
  unpaidMinor: null,
  cashPaymentsMinor: 300,
  topUpsMinor: 0,
  cashRefundsMinor: 0,
  payoutsMinor: 0,
  adjustmentsMinor: 0,
  activeSessions: 0,
};
const unpaidRow = (over: Partial<UnpaidInvoiceRow> = {}): UnpaidInvoiceRow => ({
  invoiceId: "i1",
  number: "INV-000001",
  sessionId: "se1",
  deviceName: "PC 1",
  customerName: null,
  endedAt: "2026-10-26T09:00:00Z",
  totalMinor: 300,
  outstandingMinor: 300,
  currency: "USD",
  status: "open",
  inShift: true,
  ...over,
});

const withPerms = (perms: Permission[], ui: React.ReactNode) => (
  <PermissionProvider permissions={perms}>{ui}</PermissionProvider>
);
const stepper = (unpaid: UnpaidInvoiceRow[], perms: Permission[] = ["shift.close"]) =>
  render(
    withPerms(perms, <CloseShiftStepper hallId="h" timeZone="UTC" shift={shift} unpaid={unpaid} />),
  );

beforeEach(() => {
  closeAction.mockReset();
  openAction.mockReset();
  push.mockReset();
});

describe("ShiftsPanel", () => {
  it("offers Open shift when none is open and the user may open one", () => {
    render(withPerms(["shift.open"], <ShiftsPanel hallId="h" timeZone="UTC" shifts={[]} />));
    expect(screen.getByRole("button", { name: "Open shift" })).toBeInTheDocument();
    expect(screen.getByText("No shift is open")).toBeInTheDocument();
  });
  it("hides Open shift without the permission, and when a shift is already open", () => {
    const { unmount } = render(
      withPerms([], <ShiftsPanel hallId="h" timeZone="UTC" shifts={[]} />),
    );
    expect(screen.queryByRole("button", { name: "Open shift" })).not.toBeInTheDocument();
    unmount();
    render(withPerms(["shift.open"], <ShiftsPanel hallId="h" timeZone="UTC" shifts={[shift]} />));
    expect(screen.queryByRole("button", { name: "Open shift" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View and close" })).toHaveAttribute(
      "href",
      "/halls/h/shifts/s1",
    );
  });
  it("opens a shift with the typed amount and a key, then goes to the shift", async () => {
    openAction.mockResolvedValue({ ok: true, data: { shiftId: "s9" } });
    render(withPerms(["shift.open"], <ShiftsPanel hallId="h" timeZone="UTC" shifts={[]} />));
    await userEvent.click(screen.getByRole("button", { name: "Open shift" }));
    const input = screen.getByLabelText("Opening cash");
    await userEvent.clear(input);
    await userEvent.type(input, "50");
    await userEvent.click(screen.getAllByRole("button", { name: "Open shift" }).at(-1)!);
    expect(openAction).toHaveBeenCalledWith("h", "50", expect.any(String));
    expect(push).toHaveBeenCalledWith("/halls/h/shifts/s9");
  });
  it("shows closed shifts with their discrepancy as text, not just colour", () => {
    const closed: ShiftRow = {
      ...shift,
      status: "closed",
      closedAt: "2026-10-26T16:00:00Z",
      countedCashMinor: 1250,
      differenceMinor: -50,
    };
    render(withPerms(["shift.open"], <ShiftsPanel hallId="h" timeZone="UTC" shifts={[closed]} />));
    // The phone card and the desktop table both render; CSS shows one of them.
    expect(screen.getAllByText(/Short/).length).toBeGreaterThan(0);
  });
});

describe("CloseShiftStepper", () => {
  it("with nothing unpaid, goes straight through count and review to a backend-reported result", async () => {
    closeAction.mockResolvedValue({
      ok: true,
      data: {
        expectedMinor: 1300,
        countedMinor: 1250,
        differenceMinor: -50,
        overridden: false,
        unpaidCount: 0,
      },
    });
    stepper([]);
    expect(screen.getByText(/All invoices from this shift are settled/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.type(screen.getByLabelText(/Cash counted/), "12.50");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Review shows the system's expected figure and does not compute a difference itself.
    expect(screen.getByText("$13.00")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm and close shift" }));
    expect(closeAction).toHaveBeenCalledWith(
      "h",
      "s1",
      { countedCashText: "12.50", overrideReason: undefined },
      expect.any(String),
    );
    expect(await screen.findByText("Shift closed")).toBeInTheDocument();
    expect(screen.getByText("-$0.50")).toBeInTheDocument();
    expect(screen.getByText("Short")).toBeInTheDocument();
  });

  it("blocks an employee on unpaid invoices: no override control, Continue disabled, links to collect", () => {
    stepper([unpaidRow()]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /1 invoice\(s\) from this shift are unpaid/,
    );
    expect(screen.getByRole("link", { name: "INV-000001" })).toHaveAttribute(
      "href",
      "/halls/h/invoices/i1",
    );
    expect(screen.queryByLabelText(/Close anyway/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("lets an owner override only with a reason, and sends that reason", async () => {
    closeAction.mockResolvedValue({
      ok: true,
      data: {
        expectedMinor: 1000,
        countedMinor: 1000,
        differenceMinor: 0,
        overridden: true,
        unpaidCount: 1,
      },
    });
    stepper([unpaidRow()], ["shift.close", "payment.adjust"]);
    const cont = screen.getByRole("button", { name: "Continue" });
    expect(cont).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Close anyway/));
    expect(cont).toBeDisabled(); // reason still missing
    await userEvent.type(screen.getByLabelText(/Reason for the override/), "Pays tomorrow");
    expect(cont).toBeEnabled();
    await userEvent.click(cont);
    await userEvent.type(screen.getByLabelText(/Cash counted/), "10");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm and close shift" }));
    expect(closeAction).toHaveBeenCalledWith(
      "h",
      "s1",
      { countedCashText: "10", overrideReason: "Pays tomorrow" },
      expect.any(String),
    );
    expect(await screen.findByText(/by override/)).toBeInTheDocument();
  });

  it("older unpaid invoices are listed but do not block", async () => {
    stepper([unpaidRow({ invoiceId: "old", number: "INV-000000", inShift: false })]);
    expect(screen.getByText(/All invoices from this shift are settled/)).toBeInTheDocument();
    expect(screen.getByText(/from before this shift/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("rejects an unparsable count and shows the database's refusal; a retry reuses the same key", async () => {
    closeAction.mockResolvedValue({
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "There are unpaid invoices.",
    });
    stepper([]);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.type(screen.getByLabelText(/Cash counted/), "abc");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Cash counted/));
    await userEvent.type(screen.getByLabelText(/Cash counted/), "5");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm and close shift" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("There are unpaid invoices.");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and close shift" }));
    const keys = closeAction.mock.calls.map((c) => c[3]);
    expect(keys[0]).toBe(keys[1]);
  });

  it("warns about running sessions without blocking", () => {
    render(
      withPerms(
        ["shift.close"],
        <CloseShiftStepper
          hallId="h"
          timeZone="UTC"
          shift={{ ...shift, activeSessions: 2 }}
          unpaid={[]}
        />,
      ),
    );
    expect(screen.getByText(/2 session\(s\) are still running/)).toBeInTheDocument();
  });
});

const summary: FinancialSummary = {
  currency: "USD",
  sessionsEnded: 2,
  billableSeconds: 5400,
  invoicesCount: 2,
  invoicedMinor: 900,
  voidedMinor: 300,
  collectionsCashMinor: 300,
  collectionsWalletMinor: 600,
  refundsCashMinor: 100,
  refundsWalletMinor: 0,
  walletTopUpsMinor: 5000,
  payoutsMinor: 50,
  cashAdjustmentsMinor: 0,
  shiftsClosed: 1,
  registerDifferenceMinor: -50,
  outstandingCount: 1,
  outstandingMinor: 600,
  walletLiabilityMinor: 4400,
};
const period = { from: "2026-10-26", to: "2026-10-26", start: new Date(), end: new Date() };

describe("ReportView", () => {
  it("shows each category separately with its definition; top-ups are labelled as not revenue", () => {
    render(<ReportView hallId="h" summary={summary} period={period} presets={[]} />);
    expect(screen.getByText("$9.00")).toBeInTheDocument(); // invoiced
    expect(screen.getByText("$50.00")).toBeInTheDocument(); // top-ups, separate figure
    expect(screen.getByText(/A liability, not revenue/)).toBeInTheDocument();
    expect(screen.getByText(/stored value owed to customers/)).toHaveTextContent(/are not revenue/);
    expect(screen.getByText(/spends stored value; it is not new money/)).toBeInTheDocument();
    expect(screen.getByText("-$0.50")).toBeInTheDocument(); // register difference as received
  });
  it("marks snapshot figures as 'now', not period figures", () => {
    render(<ReportView hallId="h" summary={summary} period={period} presets={[]} />);
    expect(screen.getByText(/Wallet liability \(now\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/snapshot as of now/i).length).toBe(2);
  });
  it("links presets and prefills the date form with the resolved period", () => {
    render(
      <ReportView
        hallId="h"
        summary={summary}
        period={period}
        presets={[{ label: "Today", from: "2026-10-26", to: "2026-10-26" }]}
      />,
    );
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "href",
      "/halls/h/reports?from=2026-10-26&to=2026-10-26",
    );
    // The date field posts its value through a hidden input named "from".
    expect(document.querySelector("input[name=from]")).toHaveValue("2026-10-26");
  });
});

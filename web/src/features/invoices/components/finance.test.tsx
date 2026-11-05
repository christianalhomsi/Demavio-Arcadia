import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/components/domain/PermissionGate";
import type { RefundRow } from "@/features/refunds/queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const collect = vi.fn();
vi.mock("../actions", () => ({
  collectPaymentAction: (...a: unknown[]) => collect(...a),
  voidInvoiceAction: vi.fn(),
}));
vi.mock("@/features/refunds/actions", () => ({
  requestRefundAction: vi.fn(),
  decideRefundAction: vi.fn(),
}));

import { RefundsPanel } from "@/features/refunds/components/RefundsPanel";
import { CollectPaymentDialog, type WalletOption } from "./CollectPaymentDialog";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

const inv = { id: "i1", number: "INV-000001", currency: "USD", outstandingMinor: 300 };
const wallets: WalletOption[] = [
  { id: "w1", label: "Sam · $10.00", balanceMinor: 1000, currency: "USD", frozen: false },
  { id: "w2", label: "Frozen · $5.00", balanceMinor: 500, currency: "USD", frozen: true },
  { id: "w3", label: "Euro · €5.00", balanceMinor: 500, currency: "EUR", frozen: false },
];
const dialog = (over: Partial<Parameters<typeof CollectPaymentDialog>[0]> = {}) => (
  <CollectPaymentDialog
    hallId="h"
    invoice={inv}
    methods={["cash", "wallet"]}
    partialAllowed={false}
    wallets={wallets}
    open
    onOpenChange={() => {}}
    onDone={() => {}}
    {...over}
  />
);

describe("CollectPaymentDialog", () => {
  it("shows the server's outstanding amount and pays the full amount by default", async () => {
    collect.mockResolvedValue({ ok: true, data: { paymentId: "p" } });
    render(dialog());
    expect(screen.getByText("$3.00")).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collect full amount" }));
    expect(collect).toHaveBeenCalledWith(
      "h",
      "i1",
      { method: "cash", walletId: null, amount: { kind: "full" } },
      expect.any(String),
    );
  });
  it("only offers partial amounts when the hall allows them", async () => {
    const { rerender } = render(dialog());
    expect(screen.queryByText(/partial payment/)).not.toBeInTheDocument();
    rerender(dialog({ partialAllowed: true }));
    await userEvent.click(screen.getByLabelText(/partial payment/));
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });
  it("lists only usable wallets (same currency, not frozen)", async () => {
    render(dialog());
    await userEvent.selectOptions(screen.getByLabelText("Payment method"), "wallet");
    expect(screen.getByRole("option", { name: "Sam · $10.00" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Frozen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Euro/ })).not.toBeInTheDocument();
  });
  it("disables wallet payment when there is no usable wallet", async () => {
    render(dialog({ wallets: [] }));
    await userEvent.selectOptions(screen.getByLabelText("Payment method"), "wallet");
    expect(screen.getByRole("button", { name: "Collect full amount" })).toBeDisabled();
  });
  it("reuses ONE idempotency key when the same payment is retried after an error", async () => {
    collect.mockReset();
    collect.mockResolvedValueOnce({
      ok: false,
      code: "UNAVAILABLE",
      message: "The service is temporarily unavailable. Please try again.",
    });
    collect.mockResolvedValueOnce({ ok: true, data: { paymentId: "p" } });
    render(dialog());
    const submit = screen.getByRole("button", { name: "Collect full amount" });
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Collect full amount" }));
    const keys = collect.mock.calls.map((c) => c[3]);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
  it("only offers enabled methods", () => {
    render(dialog({ methods: ["wallet"] }));
    expect(screen.queryByRole("option", { name: "Cash" })).not.toBeInTheDocument();
  });
});

describe("InvoiceStatusBadge", () => {
  it("labels every state in words", () => {
    render(
      <>
        <InvoiceStatusBadge status="open" />
        <InvoiceStatusBadge status="partially_paid" />
        <InvoiceStatusBadge status="paid" />
        <InvoiceStatusBadge status="voided" />
      </>,
    );
    for (const t of ["Open", "Partially paid", "Paid", "Voided"])
      expect(screen.getByText(t)).toBeInTheDocument();
  });
});

const refund = (over: Partial<RefundRow> = {}): RefundRow => ({
  id: "r1",
  paymentId: "p1",
  invoiceId: "i1",
  invoiceNumber: "INV-000001",
  method: "wallet",
  amountMinor: 100,
  currency: "USD",
  reasonCode: "overcharge",
  note: null,
  status: "pending",
  requestedByName: "Emp",
  requestedAt: "2026-10-26T10:00:00Z",
  decidedByName: null,
  decidedAt: null,
  decisionNote: null,
  ...over,
});

describe("RefundsPanel", () => {
  it("hides approve/reject without refund.approve", () => {
    render(
      <PermissionProvider permissions={["refund.request"]}>
        <RefundsPanel hallId="h" timeZone="UTC" refunds={[refund()]} currentUserName="Emp" />
      </PermissionProvider>,
    );
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });
  it("blocks approving your own request in the UI (the database enforces it too)", () => {
    render(
      <PermissionProvider permissions={["refund.approve"]}>
        <RefundsPanel
          hallId="h"
          timeZone="UTC"
          refunds={[refund({ requestedByName: "Owner" })]}
          currentUserName="Owner"
        />
      </PermissionProvider>,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByText(/another approver must approve/)).toBeInTheDocument();
  });
  it("lets an approver approve someone else's request", () => {
    render(
      <PermissionProvider permissions={["refund.approve"]}>
        <RefundsPanel hallId="h" timeZone="UTC" refunds={[refund()]} currentUserName="Owner" />
      </PermissionProvider>,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });
});

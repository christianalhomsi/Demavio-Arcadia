import { StatusBadge } from "@/components/domain/StatusBadge";
import type { InvoiceStatus } from "../queries";

const KEY: Record<InvoiceStatus, string> = {
  open: "Open",
  partially_paid: "PartiallyPaid",
  paid: "Paid",
  voided: "Voided",
};

/** An invoice's status comes from the database; ending a session never makes it "Paid". */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <StatusBadge status={KEY[status]} />;
}

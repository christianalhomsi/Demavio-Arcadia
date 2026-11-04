import { formatMoney } from "@/lib/money";

/** Renders a backend-provided amount in the record's own currency (spec §7.1, §10.2). */
export function Money({
  minor,
  currency,
  className,
}: {
  minor: number;
  currency: string;
  className?: string;
}) {
  return <span className={className}>{formatMoney(minor, currency)}</span>;
}

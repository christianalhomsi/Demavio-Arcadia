import { notFound } from "next/navigation";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERMISSIONS } from "@/contracts/permissions";
import { DateDemo } from "./DateDemo";

export const metadata = { title: "UI preview" };

const rows = [
  { id: "1", invoice: "INV-0001", status: "Open", total: 1250, at: "2026-10-24T12:00:00Z" },
  { id: "2", invoice: "INV-0002", status: "Paid", total: 4000, at: "2026-10-24T09:30:00Z" },
];

/** Development-only component gallery. Not reachable in production builds. */
export default function UiPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AppShell hallId="demo" hallName="Demo Hall" permissions={PERMISSIONS}>
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">UI preview</h1>
        <section className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button pending>Saving</Button>
        </section>
        <section className="space-y-2">
          <label htmlFor="demo-input" className="block text-sm font-medium">
            Text field
          </label>
          <Input id="demo-input" placeholder="Type here" />
        </section>
        <DateDemo />
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
              <span>
                <span className="block font-medium">{r.invoice}</span>
                <span className="text-muted">
                  <HallTime value={r.at} timeZone="Asia/Beirut" />
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <Money minor={r.total} currency="USD" className="font-medium tabular-nums" />
                <StatusBadge status={r.status} />
              </span>
            </li>
          ))}
        </ul>
        <EmptyState title="No devices yet" description="Add your first device to get started." />
        <ErrorState reference="demo-123" />
      </div>
    </AppShell>
  );
}

"use client";

import * as React from "react";
import { DateField, DateTimeField, TimeField } from "@/components/ui/date-fields";

/** Development-only: the date, time and dropdown fields side by side. */
export function DateDemo() {
  const [dt, setDt] = React.useState("2026-10-30T14:30");
  const [time, setTime] = React.useState("09:30");
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-accent">Date, time and lists</h2>
      <div className="grid max-w-md gap-3">
        <DateField aria-label="Date" defaultValue="2026-10-30" clearable />
        <DateTimeField aria-label="Date and time" clearable value={dt} onChange={setDt} />
        <TimeField aria-label="Time" value={time} onChange={setTime} />
        <select
          aria-label="List"
          defaultValue="b"
          className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm"
        >
          <option value="a">Option A</option>
          <option value="b">Option B</option>
          <option value="c">Option C</option>
        </select>
      </div>
    </section>
  );
}

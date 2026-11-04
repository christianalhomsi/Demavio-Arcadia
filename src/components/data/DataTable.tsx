"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { EmptyState } from "./EmptyState";

/**
 * Presentational table. Sorting, filtering and pagination are server-side (driven by URL
 * params), so the table only renders the page of rows it is given.
 */
export function DataTable<T>({
  columns,
  rows,
  caption,
  empty,
}: {
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  caption: string;
  empty?: { title: string; description?: string; action?: React.ReactNode };
}) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  if (rows.length === 0) {
    return <EmptyState title={empty?.title ?? "Nothing here yet"} {...empty} />;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table className="w-full text-start text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} scope="col" className="px-4 py-2 font-medium">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

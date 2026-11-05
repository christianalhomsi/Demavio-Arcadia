import * as React from "react";

/** Label + control + error wired for assistive tech (aria-describedby). */
export function Field({
  id,
  label,
  error,
  hint,
  hintAbove,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Show the hint between the label and the control instead of under the control. */
  hintAbove?: boolean;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {hintAbove && hint ? (
        <p id={`${id}-hint`} className="mb-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : hint && !hintAbove ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormStatus({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={state.ok ? "text-sm text-success" : "text-sm text-danger"}
    >
      {state.message}
    </p>
  );
}

"use client";

import { Minus, Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

const base = cn(
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm",
  "transition-colors placeholder:text-muted focus-visible:border-primary",
  "disabled:opacity-50 aria-[invalid=true]:border-danger",
);

/** 44px tall with 16px text on phones (no iOS zoom-on-focus, comfortable thumb target). */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, type, ...props }, ref) {
  const inner = React.useRef<HTMLInputElement | null>(null);
  const setRef = React.useCallback(
    (el: HTMLInputElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  if (type !== "number") {
    return <input ref={setRef} type={type} className={cn(base, className)} {...props} />;
  }

  // Numbers get big minus / plus buttons instead of the browser's tiny spinner arrows. They use the
  // input's own stepUp/stepDown (so min, max and step are respected) and then fire a normal input
  // event, which keeps controlled and react-hook-form inputs in sync.
  const locked = props.disabled || props.readOnly;
  function step(dir: 1 | -1) {
    const el = inner.current;
    if (!el || locked) return;
    if (dir === 1) el.stepUp();
    else el.stepDown();
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }
  const btn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-accent " +
    "transition-colors active:bg-neutral-bg disabled:opacity-40 sm:h-10 sm:w-10";

  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={locked}
        className={btn}
        onClick={() => step(-1)}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        ref={setRef}
        type="number"
        className={cn(
          base,
          "min-w-0 flex-1 px-2 text-center tabular-nums [appearance:textfield]",
          "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={locked}
        className={btn}
        onClick={() => step(1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
});

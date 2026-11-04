import * as React from "react";
import { cn } from "@/lib/cn";

/** 44px tall with 16px text on phones (no iOS zoom-on-focus, comfortable thumb target). */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm",
        "transition-colors placeholder:text-muted focus-visible:border-primary",
        "disabled:opacity-50 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
});

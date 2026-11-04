"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { useKeyboardInset } from "@/lib/ui/keyboard";
import { morphRef } from "@/lib/ui/morph";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** A bottom sheet on phones (thumb-reachable, safe-area aware) and a centered dialog from sm up. */
export function DialogContent({
  className,
  title,
  description,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  // Phones: the sheet rides above the on-screen keyboard instead of being covered by it.
  useKeyboardInset();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay fixed inset-0 z-40 bg-[var(--scrim)]" />
      <DialogPrimitive.Content
        // The panel grows out of the button that opened it (see lib/ui/morph.ts).
        ref={morphRef}
        data-morph="pending"
        className={cn(
          "sheet fixed z-50 border border-border bg-surface-raised shadow-float",
          // phone: bottom sheet
          "inset-x-0 bottom-[var(--kb-inset,0px)] flex max-h-[min(90dvh,calc(var(--vvh,100dvh)-0.5rem))] flex-col overflow-hidden rounded-t-3xl px-5 pb-[calc(1.25rem+var(--safe-bottom))] pt-3",
          // sm+: centered dialog
          "sm:inset-x-auto sm:bottom-auto sm:max-h-[90dvh] sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:px-6 sm:pb-6 sm:pt-6",
          className,
        )}
        {...props}
      >
        <div
          aria-hidden
          className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden"
        />
        <DialogPrimitive.Title className="shrink-0 pe-10 text-lg font-semibold">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 shrink-0 text-sm text-muted">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="dialog-scroll -me-2 mt-4 min-h-0 flex-1 overflow-y-auto pe-2">
          {children}
        </div>
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-neutral-bg active:bg-neutral-bg sm:top-4 sm:h-9 sm:w-9"
        >
          <X className="h-5 w-5" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

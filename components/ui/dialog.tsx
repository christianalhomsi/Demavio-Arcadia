"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-50 w-full max-w-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function DialogContent({
  className,
  children,
  onClose,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  return (
    <div
      className={cn(
        "relative bg-card rounded-none sm:rounded-3xl border border-border/60 shadow-2xl flex flex-col overflow-hidden w-full h-full",
        className
      )}
      {...props}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute left-2 sm:left-3 md:left-4 top-2 sm:top-3 md:top-4 rounded-lg p-1 sm:p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
        >
          <X size={16} className="sm:w-[18px] sm:h-[18px]" />
        </button>
      )}
      {children}
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-2 sm:px-3 md:px-6 pt-2 sm:pt-3 md:pt-6 pb-2 sm:pb-3 md:pb-4 space-y-1", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-2 sm:px-3 md:px-6 pb-2 sm:pb-3 md:pb-6 flex-1 overflow-hidden flex flex-col", className)}
      {...props}
    />
  );
}

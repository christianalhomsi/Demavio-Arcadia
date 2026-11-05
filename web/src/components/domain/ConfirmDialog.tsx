"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** Require a reason (spec: overrides, refunds, adjustments need one). */
  requireReason?: boolean;
  /** Require the user to type this text before confirming (e.g. SHUTDOWN). */
  typedConfirmation?: string;
  pending?: boolean;
  onConfirm: (reason?: string) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  requireReason,
  typedConfirmation,
  pending,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");

  const reasonOk = !requireReason || reason.trim().length > 0;
  const typedOk = !typedConfirmation || typed === typedConfirmation;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <div className="space-y-3">
          {requireReason && (
            <div>
              <label htmlFor="confirm-reason" className="mb-1 block text-sm font-medium">
                {t.cmReason}
              </label>
              <Input
                id="confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
          {typedConfirmation && (
            <div>
              <label htmlFor="confirm-typed" className="mb-1 block text-sm font-medium">
                {tpl(t.cmTypeToConfirm, { x: typedConfirmation })}
              </label>
              <Input id="confirm-typed" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="secondary">{t.cmCancel}</Button>
            </DialogClose>
            <Button
              variant={destructive ? "danger" : "primary"}
              disabled={!reasonOk || !typedOk}
              pending={pending}
              onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            >
              {confirmLabel ?? t.cmConfirm}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

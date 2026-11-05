"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { deleteHallAction, deleteUserAction } from "../actions";

/**
 * Permanent deletion, behind a warning and a typed confirmation (the exact name) plus a reason.
 * The database does the deleting; this only collects the confirmation.
 */
export function DeleteHallButton({ hallId, name }: { hallId: string; name: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {t.dlDelete}
      </Button>
      {error && (
        <p role="alert" className="basis-full text-xs text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={tpl(t.dlHallTitle, { name })}
        description={t.dlHallWarn}
        confirmLabel={t.dlDeleteForever}
        destructive
        requireReason
        typedConfirmation={name}
        pending={pending}
        onConfirm={async (reason) => {
          setPending(true);
          const r = await deleteHallAction(hallId, reason ?? "");
          setPending(false);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          } else {
            setOpen(false);
            setError(r.fieldErrors?.reason ?? r.message);
          }
        }}
      />
    </>
  );
}

export function DeleteUserButton({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {t.dlDelete}
      </Button>
      {error && (
        <p role="alert" className="basis-full text-xs text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={tpl(t.dlUserTitle, { name })}
        description={t.dlUserWarn}
        confirmLabel={t.dlDeleteForever}
        destructive
        requireReason
        typedConfirmation={email}
        pending={pending}
        onConfirm={async (reason) => {
          setPending(true);
          const r = await deleteUserAction(userId, reason ?? "");
          setPending(false);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          } else {
            setOpen(false);
            setError(r.fieldErrors?.reason ?? r.message);
          }
        }}
      />
    </>
  );
}

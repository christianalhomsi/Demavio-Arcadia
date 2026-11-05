"use client";

import { useRouter } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import * as React from "react";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { FormStatus } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateTimeField } from "@/components/ui/date-fields";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { endMaintenanceAction, requestCommandAction, startMaintenanceAction } from "../actions";
import type { DeviceStatus } from "../queries";
import { COMMAND_INFO, COMMAND_KEYS, availableCommands, type StaffCommand } from "../schemas";

type Msg = { ok: boolean; message: string } | null;

export function DeviceActions({
  hallId,
  device,
  timeZone = "UTC",
}: {
  hallId: string;
  device: DeviceStatus;
  timeZone?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = React.useState<Msg>(null);
  const [maintOpen, setMaintOpen] = React.useState(false);
  const [command, setCommand] = React.useState<StaffCommand | null>(null);
  const [pending, setPending] = React.useState(false);
  // One idempotency key per command intent: retries reuse it, a new intent gets a new key.
  const keyRef = React.useRef<string>("");

  const commands = availableCommands(device.capabilities);
  const canCommand = device.agentStatus !== "none" && device.operationalStatus === "active";

  function chooseCommand(c: StaffCommand) {
    keyRef.current = newIdempotencyKey();
    setCommand(c);
  }

  async function sendCommand() {
    if (!command) return;
    setPending(true);
    const r = await requestCommandAction(hallId, device.deviceId, command, keyRef.current);
    setPending(false);
    if (r.ok) {
      setMsg({
        ok: true,
        message: tpl(t.dvCmdRecorded, { label: t[COMMAND_KEYS[command]] }),
      });
      setCommand(null);
      router.refresh();
    } else {
      setMsg({ ok: false, message: r.message });
    }
  }

  async function endMaintenance() {
    if (!device.maintenanceId) return;
    setPending(true);
    const r = await endMaintenanceAction(hallId, device.maintenanceId);
    setPending(false);
    setMsg(r.ok ? { ok: true, message: t.dvMaintEnded } : { ok: false, message: r.message });
    if (r.ok) router.refresh();
  }

  const info = command ? COMMAND_INFO[command] : null;

  return (
    <PermissionGate permission="device.control">
      <section aria-labelledby="actions-h" className="space-y-3">
        <h2 id="actions-h" className="text-lg font-medium">
          {t.cmActions}
        </h2>
        <div className="flex flex-wrap gap-2">
          {device.maintenanceStatus === "in_maintenance" ? (
            <Button variant="secondary" onClick={endMaintenance} pending={pending}>
              {t.dvEndMaint}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setMaintOpen(true)}>
              {t.dvStartMaint}
            </Button>
          )}
          {commands.map((c) => (
            <Button
              key={c}
              variant="secondary"
              disabled={!canCommand}
              onClick={() => chooseCommand(c)}
            >
              {t[COMMAND_KEYS[c]]}
            </Button>
          ))}
        </div>
        {!canCommand && (
          <p className="text-sm text-muted">
            {device.agentStatus === "none" ? t.dvCmdNeedsAgent : t.dvCmdDisabled}
          </p>
        )}
        {device.agentStatus === "offline" && canCommand && (
          <p className="text-sm text-warning">{t.dvAgentOfflineNote}</p>
        )}
        <FormStatus state={msg} />
      </section>

      <MaintenanceDialog
        open={maintOpen}
        onOpenChange={setMaintOpen}
        hallId={hallId}
        deviceId={device.deviceId}
        timeZone={timeZone}
        onDone={() => {
          setMaintOpen(false);
          setMsg({ ok: true, message: t.dvPlacedMaint });
          router.refresh();
        }}
      />

      <ConfirmDialog
        key={command ?? "none"}
        open={command !== null}
        onOpenChange={(o) => !o && setCommand(null)}
        title={
          command && info
            ? tpl(t.dvCmdTitle, { label: t[COMMAND_KEYS[command]], name: device.name })
            : ""
        }
        description={info?.destructive ? t.dvCmdDestructive : t.dvCmdSafe}
        confirmLabel={command && info ? t[COMMAND_KEYS[command]] : t.cmConfirm}
        destructive={info?.destructive}
        typedConfirmation={info?.destructive ? command! : undefined}
        pending={pending}
        onConfirm={sendCommand}
      />
    </PermissionGate>
  );
}

function MaintenanceDialog({
  open,
  onOpenChange,
  hallId,
  deviceId,
  timeZone,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hallId: string;
  deviceId: string;
  timeZone: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = React.useState("");
  const [expectedEnd, setExpectedEnd] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    // datetime-local has no zone: interpret it in the HALL's time zone and send UTC.
    const end = expectedEnd ? fromZonedTime(`${expectedEnd}:00`, timeZone).toISOString() : "";
    const r = await startMaintenanceAction(hallId, deviceId, { reason, expectedEnd: end });
    setPending(false);
    if (r.ok) {
      setReason("");
      setExpectedEnd("");
      onDone();
    } else setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.dvStartMaint} description={t.dvMaintDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="m-reason" className="mb-1 block text-sm font-medium">
              {t.cmReason}
            </label>
            <Input id="m-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-end" className="mb-1 block text-sm font-medium">
              {t.dvExpectedEnd}
            </label>
            <DateTimeField id="m-end" clearable value={expectedEnd} onChange={setExpectedEnd} />
          </div>
          <p className="text-xs text-muted">{t.dvAffectedNote}</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t.cmCancel}
              </Button>
            </DialogClose>
            <Button type="submit" pending={pending}>
              {t.dvStartMaint}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCan } from "@/components/domain/PermissionGate";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney } from "@/lib/money";
import { startPackageSessionAction } from "@/features/packages/actions";
import type { PackageRow } from "@/features/packages/queries";
import type { ActionResult } from "@/lib/actions/result";
import {
  convertToOpenAction,
  endSessionAction,
  extendSessionAction,
  startWalkInAction,
} from "../actions";
import { END_TYPES, END_TYPE_KEYS, type EndType } from "../schemas";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

function errorText(r: Extract<ActionResult<unknown>, { ok: false }>): string {
  return r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message;
}

/** Shared shell: pending state, error display, and an idempotency key that survives retries. */
function useSubmit<T>(
  run: (key: string) => Promise<ActionResult<T>>,
  onSuccess: (data: T) => void,
) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  // One key per user intent. It is kept across failed attempts (a retry is the same intent) and
  // replaced only after a success.
  const keyRef = React.useRef<string>("");
  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await run(keyRef.current);
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      onSuccess(r.data);
    } else setError(errorText(r));
  }
  return { submit, pending, error, reset: () => setError(undefined) };
}

export interface DeviceOption {
  id: string;
  name: string;
  available: boolean;
}

export function WalkInDialog({
  hallId,
  devices,
  packages = [],
  onDone,
  initialDeviceId,
  triggerLabel,
  triggerVariant,
  triggerSize,
  triggerClassName,
}: {
  hallId: string;
  devices: DeviceOption[];
  packages?: PackageRow[];
  onDone: () => void;
  /** Open with this device already chosen (used from a device card). */
  initialDeviceId?: string;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerClassName?: string;
}) {
  const { t } = useI18n();
  const canStart = useCan("session.start");
  const [open, setOpen] = React.useState(false);
  const free = devices.filter((d) => d.available);
  const [deviceId, setDeviceId] = React.useState(initialDeviceId ?? "");
  const [type, setType] = React.useState<"fixed" | "open">("fixed");
  const [minutes, setMinutes] = React.useState("60");
  const [guest, setGuest] = React.useState("");
  const [hasAccount, setHasAccount] = React.useState(false);
  const [username, setUsername] = React.useState("");
  // "" = regular hourly pricing, otherwise a package id.
  const [packageId, setPackageId] = React.useState("");

  const { submit, pending, error } = useSubmit(
    (key) =>
      packageId
        ? startPackageSessionAction(
            hallId,
            {
              packageId,
              deviceId: deviceId || free[0]?.id || "",
              guestName: hasAccount ? "" : guest,
              username: hasAccount ? username : undefined,
            },
            key,
          )
        : startWalkInAction(
            hallId,
            {
              deviceId: deviceId || free[0]?.id || "",
              type,
              durationMinutes: type === "fixed" ? Number(minutes) : null,
              guestName: hasAccount ? "" : guest,
              username: hasAccount ? username : undefined,
            },
            key,
          ),
    () => {
      setOpen(false);
      setGuest("");
      setUsername("");
      onDone();
    },
  );

  if (!canStart) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
      >
        {triggerLabel ?? t.ssStartWalkIn}
      </Button>
      <DialogContent title={t.ssWalkInTitle} description={t.ssWalkInDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="wi-device" label={t.colDevice}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={deviceId || free[0]?.id || ""}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {free.length === 0 && <option value="">{t.ssNoFree}</option>}
                {free.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div role="group" className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-bg p-1 text-sm">
            {[true, false].map((acc) => (
              <button
                key={String(acc)}
                type="button"
                aria-pressed={hasAccount === acc}
                onClick={() => setHasAccount(acc)}
                className="min-h-11 rounded-lg px-2 aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:shadow-card"
              >
                {acc ? t.wiHasAccount : t.wiNoAccount}
              </button>
            ))}
          </div>
          {hasAccount ? (
            <Field id="wi-user" label={t.wiUsername}>
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              )}
            </Field>
          ) : (
            <Field id="wi-guest" label={t.rsCustomerName} hint={t.wiGuestHint}>
              {(p) => <Input {...p} value={guest} onChange={(e) => setGuest(e.target.value)} />}
            </Field>
          )}
          {packages.length > 0 && (
            <Field id="wi-pkg" label={t.pkPricing}>
              {(p) => (
                <select
                  {...p}
                  className={selectCls}
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                >
                  <option value="">{t.pkRegular}</option>
                  {packages.map((k) => (
                    <option key={k.id} value={k.id}>
                      {tpl(t.pkOption, {
                        name: k.name,
                        dur: k.durationMinutes,
                        price: formatMoney(k.priceMinor, k.currency),
                      })}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {!packageId && (
            <Field id="wi-type" label={t.ssSessionType}>
              {(p) => (
                <select
                  {...p}
                  className={selectCls}
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  <option value="fixed">{t.ssFixedTime}</option>
                  <option value="open">{t.ssOpenType}</option>
                </select>
              )}
            </Field>
          )}
          {!packageId && type === "fixed" && (
            <Field id="wi-min" label={t.ssDuration}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={5}
                  max={720}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              )}
            </Field>
          )}
          <p className="text-xs text-muted">{packageId ? t.pkPickDevice : t.ssPriceNote}</p>
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
            <Button type="submit" pending={pending} disabled={free.length === 0}>
              {t.ssStartSession}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EndSessionDialog({
  hallId,
  sessionId,
  deviceName,
  open,
  onOpenChange,
  onDone,
}: {
  hallId: string;
  sessionId: string;
  deviceName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const canAdmin = useCan("hall.settings.manage");
  const [endType, setEndType] = React.useState<EndType>("normal");
  const [reason, setReason] = React.useState("");
  const { submit, pending, error } = useSubmit(
    () => endSessionAction(hallId, sessionId, endType, reason),
    () => {
      onOpenChange(false);
      onDone();
    },
  );
  const types = END_TYPES.filter((k) => k !== "administrative" || canAdmin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={tpl(t.ssEndTitle, { device: deviceName })} description={t.ssEndDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="end-type" label={t.ssHowEnded}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={endType}
                onChange={(e) => setEndType(e.target.value as EndType)}
              >
                {types.map((k) => (
                  <option key={k} value={k}>
                    {t[END_TYPE_KEYS[k]]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {endType !== "normal" && (
            <Field id="end-reason" label={t.cmReason}>
              {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}
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
            <Button type="submit" variant="danger" pending={pending}>
              {t.ssEndSession}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExtendSessionDialog({
  hallId,
  sessionId,
  deviceName,
  open,
  onOpenChange,
  onDone,
}: {
  hallId: string;
  sessionId: string;
  deviceName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [minutes, setMinutes] = React.useState("15");
  const [reason, setReason] = React.useState("");
  const { submit, pending, error } = useSubmit(
    (key) => extendSessionAction(hallId, sessionId, { minutes: Number(minutes), reason }, key),
    () => {
      onOpenChange(false);
      setReason("");
      onDone();
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={tpl(t.ssExtendTitle, { device: deviceName })}
        description={t.ssExtendDesc}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="ext-min" label={t.ssExtraMin}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={720}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            )}
          </Field>
          <Field id="ext-reason" label={t.cmReason}>
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
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
              {t.ssExtend}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConvertToOpenDialog({
  hallId,
  sessionId,
  deviceName,
  open,
  onOpenChange,
  onDone,
}: {
  hallId: string;
  sessionId: string;
  deviceName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = React.useState("");
  const { submit, pending, error } = useSubmit(
    () => convertToOpenAction(hallId, sessionId, reason),
    () => {
      onOpenChange(false);
      setReason("");
      onDone();
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={tpl(t.ssConvTitle, { device: deviceName })} description={t.ssConvDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="conv-reason" label={t.cmReason}>
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
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
              {t.ssConvBtn}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

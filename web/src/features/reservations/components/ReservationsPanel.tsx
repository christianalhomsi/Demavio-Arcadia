"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { fromZonedTime } from "date-fns-tz";
import { EmptyState } from "@/components/data/EmptyState";
import { PermissionGate, useCan } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateTimeField } from "@/components/ui/date-fields";
import { formatHallTime } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import type { ActionResult } from "@/lib/actions/result";
import { useHallRealtime } from "@/lib/realtime/useHallRealtime";
import {
  cancelReservationAction,
  checkInReservationAction,
  confirmReservationAction,
  createReservationAction,
  rejectReservationAction,
} from "../actions";
import type { ReservationRow } from "../queries";
import { STATUS_KEYS, type ReservationStatus } from "../schemas";

const TONE: Record<ReservationStatus, "info" | "success" | "neutral" | "warning"> = {
  pending: "warning",
  confirmed: "info",
  checked_in: "success",
  canceled: "neutral",
  no_show: "warning",
};
const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

const errorText = (r: Extract<ActionResult<unknown>, { ok: false }>) =>
  r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message;

export function ReservationsPanel({
  hallId,
  timeZone,
  graceMinutes,
  reservations,
  devices,
  serverNow,
}: {
  hallId: string;
  timeZone: string;
  graceMinutes: number;
  reservations: ReservationRow[];
  devices: { id: string; name: string }[];
  serverNow: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const live = useHallRealtime(hallId, ["reservations", "sessions"]);
  const [checkIn, setCheckIn] = React.useState<ReservationRow | null>(null);
  const [cancel, setCancel] = React.useState<ReservationRow | null>(null);
  const [reject, setReject] = React.useState<ReservationRow | null>(null);
  const [rowError, setRowError] = React.useState<string | undefined>();
  const refresh = () => router.refresh();
  const sorted = [...reservations].sort((a, b) => a.startAt.localeCompare(b.startAt));

  /** The buttons for one reservation; the phone card and the desktop table row both use them. */
  const rowActions = (r: ReservationRow) => (
    <>
      {r.status === "pending" && (
        <span className="flex justify-end gap-2">
          <PermissionGate permission="reservation.confirm">
            <Button
              size="sm"
              onClick={async () => {
                setRowError(undefined);
                const res = await confirmReservationAction(hallId, r.id);
                if (res.ok) refresh();
                else setRowError(errorText(res));
              }}
            >
              {t.rsConfirm}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setReject(r)}>
              {t.rsReject}
            </Button>
          </PermissionGate>
        </span>
      )}
      {r.status === "confirmed" && (
        <span className="flex justify-end gap-2">
          <PermissionGate permission="reservation.check_in">
            <Button size="sm" onClick={() => setCheckIn(r)}>
              {t.rsCheckIn}
            </Button>
          </PermissionGate>
          <PermissionGate permission="reservation.cancel">
            <Button size="sm" variant="secondary" onClick={() => setCancel(r)}>
              {t.cmCancel}
            </Button>
          </PermissionGate>
        </span>
      )}
      {r.status === "checked_in" && r.sessionId && (
        <Link className="text-sm underline" href={`/halls/${hallId}/sessions/${r.sessionId}`}>
          {t.cmViewSession}
        </Link>
      )}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{t.rsArrivals}</h2>
        <PermissionGate permission="reservation.create">
          <CreateReservationDialog
            hallId={hallId}
            timeZone={timeZone}
            devices={devices}
            onDone={refresh}
          />
        </PermissionGate>
      </div>
      {!live && (
        <p role="status" className="rounded-md bg-warning-bg p-2 text-sm text-warning">
          {t.cmLivePaused}
        </p>
      )}
      {sorted.length === 0 ? (
        <EmptyState title={t.rsNoRes} />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {sorted.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    className="text-lg font-semibold tabular-nums"
                    href={`/halls/${hallId}/reservations/${r.id}`}
                  >
                    {formatHallTime(r.startAt, timeZone, "HH:mm")}–
                    {formatHallTime(r.endAt, timeZone, "HH:mm")}
                  </Link>
                  <Badge tone={TONE[r.status]}>{t[STATUS_KEYS[r.status]]}</Badge>
                </div>
                <p className="mt-1 text-muted">
                  {[r.deviceName, r.customerName ?? "—"].join(" · ")}
                  {r.playersCount ? ` · ${tpl(t.rsPlayersN, { n: r.playersCount })}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 [&_button]:min-h-11 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
                  {rowActions(r)}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-card md:block">
            <table className="w-full text-start text-sm">
              <caption className="sr-only">{t.rsCaption}</caption>
              <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2">
                    {t.colTime}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t.colDevice}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t.colCustomer}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t.colStatus}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    <span className="sr-only">{t.cmActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 tabular-nums">
                      <Link
                        className="hover:underline"
                        href={`/halls/${hallId}/reservations/${r.id}`}
                      >
                        {formatHallTime(r.startAt, timeZone, "HH:mm")}–
                        {formatHallTime(r.endAt, timeZone, "HH:mm")}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{r.deviceName}</td>
                    <td className="px-4 py-2">
                      {r.customerName ?? "—"}
                      {r.playersCount ? (
                        <span className="ms-2 text-xs text-muted">
                          {tpl(t.rsPlayersN, { n: r.playersCount })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={TONE[r.status]}>{t[STATUS_KEYS[r.status]]}</Badge>
                    </td>
                    <td className="px-4 py-2 text-end">{rowActions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rowError && (
        <p role="alert" className="text-sm text-danger">
          {rowError}
        </p>
      )}
      {reject && (
        <CancelDialog
          key={reject.id}
          hallId={hallId}
          reservation={reject}
          mode="reject"
          onClose={() => setReject(null)}
          onDone={() => {
            setReject(null);
            refresh();
          }}
        />
      )}
      {checkIn && (
        <CheckInDialog
          key={checkIn.id}
          hallId={hallId}
          reservation={checkIn}
          late={Date.parse(serverNow) > Date.parse(checkIn.startAt) + graceMinutes * 60_000}
          graceMinutes={graceMinutes}
          onClose={() => setCheckIn(null)}
          onDone={() => {
            setCheckIn(null);
            refresh();
          }}
        />
      )}
      {cancel && (
        <CancelDialog
          key={cancel.id}
          hallId={hallId}
          reservation={cancel}
          onClose={() => setCancel(null)}
          onDone={() => {
            setCancel(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

export function CheckInDialog({
  hallId,
  reservation,
  late,
  graceMinutes,
  onClose,
  onDone,
}: {
  hallId: string;
  reservation: ReservationRow;
  late: boolean;
  graceMinutes: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const canOverride = useCan("reservation.override_late");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    // Check-in is idempotent in the database (state-based), so a repeated click returns the same session.
    const r = await checkInReservationAction(hallId, reservation.id, late ? reason : undefined);
    setPending(false);
    if (r.ok) onDone();
    else setError(errorText(r));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={tpl(t.rsCheckInTitle, { name: reservation.customerName ?? t.rsCustomerFallback })}
        description={tpl(t.rsCheckInDesc, { device: reservation.deviceName })}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          {late && (
            <>
              <p className="rounded-md bg-warning-bg p-2 text-sm text-warning">
                {tpl(t.rsGrace, { n: graceMinutes })} {canOverride ? t.rsLateReason : t.rsLateOwner}
              </p>
              {canOverride && (
                <Field id="ci-reason" label={t.rsLateReasonLabel}>
                  {(p) => (
                    <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />
                  )}
                </Field>
              )}
            </>
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
            <Button type="submit" pending={pending} disabled={late && !canOverride}>
              {t.rsCheckIn}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelDialog({
  hallId,
  reservation,
  mode = "cancel",
  onClose,
  onDone,
}: {
  hallId: string;
  reservation: ReservationRow;
  mode?: "cancel" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const r =
      mode === "reject"
        ? await rejectReservationAction(hallId, reservation.id, reason)
        : await cancelReservationAction(hallId, reservation.id, reason);
    setPending(false);
    if (r.ok) onDone();
    else setError(errorText(r));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={mode === "reject" ? t.rsRejectTitle : t.rsCancelTitle}
        description={mode === "reject" ? t.rsRejectDesc : t.rsCancelDesc}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="cancel-reason" label={t.cmReason}>
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {mode === "reject" ? t.rsKeepReq : t.rsKeepRes}
            </Button>
            <Button type="submit" variant="danger" pending={pending}>
              {mode === "reject" ? t.rsRejectBtn : t.rsCancelBtn}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateReservationDialog({
  hallId,
  timeZone,
  devices,
  onDone,
}: {
  hallId: string;
  timeZone: string;
  devices: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [deviceId, setDeviceId] = React.useState("");
  const [guest, setGuest] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const keyRef = React.useRef("");

  // datetime-local has no zone: interpret what staff type in the HALL's time zone.
  const toIso = (v: string) => (v ? fromZonedTime(`${v}:00`, timeZone).toISOString() : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await createReservationAction(
      hallId,
      {
        deviceId: deviceId || devices[0]?.id || "",
        guestName: guest,
        startAt: toIso(start),
        endAt: toIso(end),
      },
      keyRef.current,
    );
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      setOpen(false);
      setGuest("");
      onDone();
    } else setError(errorText(r));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t.rsNew}
      </Button>
      <DialogContent title={t.rsNew} description={tpl(t.rsNewDesc, { tz: timeZone })}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="nr-device" label={t.colDevice}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={deviceId || devices[0]?.id || ""}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="nr-guest" label={t.rsCustomerName}>
            {(p) => <Input {...p} value={guest} onChange={(e) => setGuest(e.target.value)} />}
          </Field>
          <Field id="nr-start" label={t.colStart}>
            {(p) => <DateTimeField {...p} value={start} onChange={setStart} />}
          </Field>
          <Field id="nr-end" label={t.colEnd}>
            {(p) => <DateTimeField {...p} value={end} onChange={setEnd} />}
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
              {t.rsCreate}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

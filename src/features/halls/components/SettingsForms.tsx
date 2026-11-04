"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { Field, FormStatus } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeField } from "@/components/ui/date-fields";
import { useCan } from "@/components/domain/PermissionGate";
import type { ActionResult } from "@/lib/actions/result";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale, tpl } from "@/lib/i18n/messages";
import { zodResolver } from "@/lib/forms/zodResolver";
import { setWorkingHoursAction, updateHallProfileAction, updatePoliciesAction } from "../actions";
import type { HallDetails, HallSettings, WorkingHourRange } from "../queries";
import {
  PAYMENT_METHODS,
  WEEKDAYS,
  hallProfileSchema,
  policiesSchema,
  workingHoursSchema,
  type HallProfileInput,
  type PoliciesInput,
} from "../schemas";

type Status = { ok: boolean; message: string } | null;

function toStatus(r: ActionResult<unknown>, success: string): Status {
  return r.ok ? { ok: true, message: success } : { ok: false, message: r.message };
}

const select =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm aria-[invalid=true]:border-danger";

export function HallProfileForm({ hall }: { hall: HallDetails }) {
  const { t } = useI18n();
  const canEdit = useCan("hall.settings.manage");
  const [status, setStatus] = React.useState<Status>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<HallProfileInput>({
    resolver: zodResolver(hallProfileSchema),
    defaultValues: {
      name: hall.name,
      address: hall.address ?? "",
      contactPhone: hall.contactPhone ?? "",
      timeZone: hall.timeZone,
    },
  });

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setStatus(null);
        const r = await updateHallProfileAction(hall.id, values);
        if (!r.ok && r.fieldErrors) {
          for (const [k, m] of Object.entries(r.fieldErrors)) {
            const key = k === "time_zone" ? "timeZone" : (k as keyof HallProfileInput);
            setError(key, { message: m });
          }
        }
        setStatus(toStatus(r, t.cfgProfileSaved));
      })}
    >
      <Field id="hall-name" label={t.cfgHallName} error={errors.name?.message}>
        {(p) => <Input {...p} disabled={!canEdit} {...register("name")} />}
      </Field>
      <Field id="hall-address" label={t.cfgAddress} error={errors.address?.message}>
        {(p) => <Input {...p} disabled={!canEdit} {...register("address")} />}
      </Field>
      <Field id="hall-phone" label={t.cfgPhone} error={errors.contactPhone?.message}>
        {(p) => <Input {...p} type="tel" disabled={!canEdit} {...register("contactPhone")} />}
      </Field>
      <div>
        <p className="mb-1 text-sm font-medium">{t.cfgTz}</p>
        <p className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-muted">
          {hall.timeZone}
        </p>
        <p className="mt-1 text-xs text-muted">{t.cfgTzLocked}</p>
      </div>
      <p className="text-sm text-muted">{tpl(t.cfgCurrency, { cur: hall.currency })}</p>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" pending={isSubmitting}>
            {t.cfgSaveProfile}
          </Button>
          <FormStatus state={status} />
        </div>
      )}
    </form>
  );
}

export function PoliciesForm({ hallId, settings }: { hallId: string; settings: HallSettings }) {
  const { t } = useI18n();
  const canEdit = useCan("hall.settings.manage");
  const [status, setStatus] = React.useState<Status>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PoliciesInput>({
    resolver: zodResolver(policiesSchema),
    defaultValues: settings,
  });

  const num = { valueAsNumber: true } as const;

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setStatus(null);
        setStatus(toStatus(await updatePoliciesAction(hallId, values), t.cfgPoliciesSaved));
      })}
    >
      <p className="rounded-md bg-warning-bg p-3 text-sm text-warning">{t.cfgPoliciesNote}</p>
      <Field id="grace" label={t.cfgGrace} error={errors.checkinGraceMinutes?.message}>
        {(p) => (
          <Input
            {...p}
            type="number"
            min={0}
            disabled={!canEdit}
            {...register("checkinGraceMinutes", num)}
          />
        )}
      </Field>
      <Field
        id="cancel"
        label={t.cfgCancelDeadline}
        error={errors.cancellationDeadlineMinutes?.message}
      >
        {(p) => (
          <Input
            {...p}
            type="number"
            min={0}
            disabled={!canEdit}
            {...register("cancellationDeadlineMinutes", num)}
          />
        )}
      </Field>
      <Field id="reminder" label={t.cfgReminder} error={errors.reminderMinutes?.message}>
        {(p) => (
          <Input
            {...p}
            type="number"
            min={0}
            disabled={!canEdit}
            {...register("reminderMinutes", num)}
          />
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!canEdit} {...register("waitingListEnabled")} />{" "}
        {t.cfgWaiting}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!canEdit} {...register("allowPartialPayments")} />{" "}
        {t.cfgPartial}
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t.cfgMethods}</legend>
        <Controller
          control={control}
          name="paymentMethods"
          render={({ field }) => (
            <div className="flex gap-4">
              {PAYMENT_METHODS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={field.value.includes(m)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked ? [...field.value, m] : field.value.filter((x) => x !== m),
                      )
                    }
                  />
                  {m === "cash" ? t.methodCash : t.methodWallet}
                </label>
              ))}
            </div>
          )}
        />
        {errors.paymentMethods && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {errors.paymentMethods.message}
          </p>
        )}
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" pending={isSubmitting}>
            {t.cfgSavePolicies}
          </Button>
          <FormStatus state={status} />
        </div>
      )}
    </form>
  );
}

export function WorkingHoursEditor({
  hallId,
  initial,
}: {
  hallId: string;
  initial: WorkingHourRange[];
}) {
  const { t, locale } = useI18n();
  const canEdit = useCan("hall.settings.manage");
  const [ranges, setRanges] = React.useState<WorkingHourRange[]>(initial);
  const [status, setStatus] = React.useState<Status>(null);
  const [pending, setPending] = React.useState(false);

  const parsed = workingHoursSchema.safeParse(ranges);
  const problem = parsed.success ? null : (parsed.error.issues[0]?.message ?? t.cfgInvalidHours);

  const update = (i: number, patch: Partial<WorkingHourRange>) =>
    setRanges((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function save() {
    if (!parsed.success) return;
    setPending(true);
    setStatus(null);
    setStatus(toStatus(await setWorkingHoursAction(hallId, parsed.data), t.cfgHoursSaved));
    setPending(false);
  }

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-muted">{t.cfgHoursNote}</p>
      {ranges.length === 0 && <p className="text-sm text-muted">{t.cfgNoHours}</p>}
      <ul className="space-y-2">
        {ranges.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t.cfgDay}
              className={`${select} w-36`}
              disabled={!canEdit}
              value={r.weekday}
              onChange={(e) => update(i, { weekday: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d, idx) => (
                <option key={d} value={idx}>
                  {locale === "ar"
                    ? new Intl.DateTimeFormat(formatLocale("ar"), {
                        weekday: "long",
                        timeZone: "UTC",
                      }).format(new Date(Date.UTC(2026, 10, 1 + idx)))
                    : d}
                </option>
              ))}
            </select>
            <TimeField
              aria-label={t.cfgOpens}
              className="w-40"
              disabled={!canEdit}
              value={r.opens}
              onChange={(v) => update(i, { opens: v })}
            />
            <span aria-hidden>–</span>
            <TimeField
              aria-label={t.cfgCloses}
              className="w-40"
              disabled={!canEdit}
              value={r.closes}
              onChange={(v) => update(i, { closes: v })}
            />
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRanges((rs) => rs.filter((_, idx) => idx !== i))}
              >
                {t.pcRemove}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setRanges((rs) => [...rs, { weekday: 1, opens: "09:00", closes: "22:00" }])
            }
          >
            {t.cfgAddRange}
          </Button>
          <Button type="button" onClick={save} pending={pending} disabled={!parsed.success}>
            {t.cfgSaveHours}
          </Button>
          <FormStatus state={status} />
        </div>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { Field, FormStatus } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/messages";
import { zodResolver } from "@/lib/forms/zodResolver";
import { upsertDeviceAction } from "../actions";
import {
  CAPABILITIES,
  DEVICE_CATEGORIES,
  deviceSchema,
  deviceTypeForCategory,
  type DeviceInput,
} from "../schemas";

const CAP_LABEL: Record<string, keyof Messages> = {
  lock: "capLock",
  unlock: "capUnlock",
  shutdown: "capShutdown",
  restart: "capRestart",
};

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

export function DeviceForm({
  hallId,
  deviceId,
  initial,
}: {
  hallId: string;
  deviceId: string | null;
  initial?: DeviceInput;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null);
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeviceInput>({
    resolver: zodResolver(deviceSchema),
    defaultValues: initial ?? {
      name: "",
      deviceType: "pc",
      category: "PC",
      capabilities: [],
      status: "active",
    },
  });

  const currentCategory = watch("category");
  const isCustomCategory =
    currentCategory !== "" && !(DEVICE_CATEGORIES as readonly string[]).includes(currentCategory);

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setStatus(null);
        const r = await upsertDeviceAction(hallId, deviceId, values);
        if (r.ok) {
          router.push(`/halls/${hallId}/devices/${r.data.id}`);
          router.refresh();
          return;
        }
        if (r.fieldErrors?.name) setError("name", { message: r.fieldErrors.name });
        setStatus({ ok: false, message: r.message });
      })}
    >
      <Field id="dev-name" label={t.dvName} error={errors.name?.message}>
        {(p) => <Input {...p} {...register("name")} />}
      </Field>
      <Field
        id="dev-cat"
        label={t.dvCategory}
        hint={t.dvCategoryHint}
        error={errors.category?.message}
      >
        {(p) => (
          <select
            {...p}
            className={selectCls}
            {...register("category", {
              // Picking a standard kind also sets the matching device type.
              onChange: (e) => {
                const type = deviceTypeForCategory(e.target.value);
                if (type) setValue("deviceType", type);
              },
            })}
          >
            {currentCategory === "" && <option value="">{t.dvCatNone}</option>}
            {DEVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {isCustomCategory && <option value={currentCategory}>{currentCategory}</option>}
          </select>
        )}
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t.dvCaps}</legend>
        <Controller
          control={control}
          name="capabilities"
          render={({ field }) => (
            <div className="flex flex-wrap gap-4">
              {CAPABILITIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.value.includes(c)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked ? [...field.value, c] : field.value.filter((x) => x !== c),
                      )
                    }
                  />
                  {CAP_LABEL[c] ? t[CAP_LABEL[c]] : c}
                </label>
              ))}
            </div>
          )}
        />
      </fieldset>
      <Field id="dev-status" label={t.cmStatus} hint={t.dvStatusHint}>
        {(p) => (
          <select {...p} className={selectCls} {...register("status")}>
            <option value="active">{t.dvActive}</option>
            <option value="disabled">{t.dvDisabled}</option>
          </select>
        )}
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" pending={isSubmitting}>
          {deviceId ? t.dvSave : t.dvAdd}
        </Button>
        <FormStatus state={status} />
      </div>
    </form>
  );
}

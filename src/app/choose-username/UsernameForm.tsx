"use client";

import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setMyUsernameAction } from "@/features/profile/actions";
import { USERNAME } from "@/lib/auth/credentials";
import { useI18n } from "@/lib/i18n/client";

export function UsernameForm({ next }: { next: string }) {
  const { t } = useI18n();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!USERNAME.test(name.trim())) {
      setError(t.errUsername);
      return;
    }
    setPending(true);
    const r = await setMyUsernameAction(name, next);
    if (r.ok) {
      window.location.assign(r.data.destination);
      return;
    }
    setPending(false);
    setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.message);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field id="cu-name" label={t.username} hint={t.cuHint} error={error}>
        {(p) => (
          <Input
            {...p}
            autoComplete="username"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" pending={pending} className="w-full">
        {t.cuSave}
      </Button>
    </form>
  );
}

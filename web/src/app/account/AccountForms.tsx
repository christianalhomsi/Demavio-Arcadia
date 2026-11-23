"use client";

import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeMyPasswordAction, updateMyAccountAction } from "@/features/profile/actions";
import { MIN_PASSWORD, USERNAME } from "@/lib/auth/credentials";
import { useI18n } from "@/lib/i18n/client";

export function AccountForms({
  email,
  username: initialUsername,
  displayName: initialName,
  hasPassword,
}: {
  email: string;
  username: string;
  displayName: string;
  hasPassword: boolean;
}) {
  const { t } = useI18n();

  const [username, setUsername] = React.useState(initialUsername);
  const [name, setName] = React.useState(initialName);
  const [pErr, setPErr] = React.useState<{ username?: string; name?: string; form?: string }>({});
  const [pOk, setPOk] = React.useState(false);
  const [pPending, setPPending] = React.useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setPOk(false);
    if (!USERNAME.test(username.trim())) {
      setPErr({ username: t.errUsername });
      return;
    }
    setPErr({});
    setPPending(true);
    const r = await updateMyAccountAction(username, name);
    setPPending(false);
    if (r.ok) setPOk(true);
    else if (r.fieldErrors?.username) setPErr({ username: r.message });
    else setPErr({ form: r.message });
  }

  const [cur, setCur] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [conf, setConf] = React.useState("");
  const [wErr, setWErr] = React.useState<{ cur?: string; pw?: string; conf?: string; form?: string }>({});
  const [wOk, setWOk] = React.useState(false);
  const [wPending, setWPending] = React.useState(false);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setWOk(false);
    if (cur.length === 0) return setWErr({ cur: t.acWrongPw });
    if (pw.length < MIN_PASSWORD) return setWErr({ pw: t.errPasswordShort });
    if (pw !== conf) return setWErr({ conf: t.errPasswordMismatch });
    setWErr({});
    setWPending(true);
    const r = await changeMyPasswordAction(cur, pw);
    setWPending(false);
    if (r.ok) {
      setWOk(true);
      setCur("");
      setPw("");
      setConf("");
    } else if (r.fieldErrors?.current) setWErr({ cur: t.acWrongPw });
    else setWErr({ form: r.message });
  }

  return (
    <>
      <form onSubmit={saveProfile} className="space-y-3 rounded-2xl border border-border bg-surface p-4" noValidate>
        <h2 className="font-semibold">{t.acProfile}</h2>
        <p dir="ltr" className="text-sm text-muted rtl:text-end">
          {t.acEmail}: {email}
        </p>
        <Field id="ac-username" label={t.username} error={pErr.username}>
          {(p) => (
            <Input
              {...p}
              autoComplete="username"
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
        </Field>
        <Field id="ac-name" label={t.acFullName} error={pErr.name}>
          {(p) => (
            <Input
              {...p}
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {pErr.form && <p role="alert" className="text-sm text-danger">{pErr.form}</p>}
        {pOk && <p role="status" className="text-sm text-success">{t.acSaved}</p>}
        <Button type="submit" pending={pPending} className="w-full">
          {t.acSaveProfile}
        </Button>
      </form>

      <form onSubmit={savePassword} className="space-y-3 rounded-2xl border border-border bg-surface p-4" noValidate>
        <h2 className="font-semibold">{t.acPassword}</h2>
        {hasPassword ? (
          <>
            <Field id="ac-cur" label={t.acCurrentPw} error={wErr.cur}>
              {(p) => (
                <Input {...p} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
              )}
            </Field>
            <Field id="ac-pw" label={t.acNewPw} error={wErr.pw}>
              {(p) => (
                <Input {...p} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              )}
            </Field>
            <Field id="ac-conf" label={t.acConfirmPw} error={wErr.conf}>
              {(p) => (
                <Input {...p} type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
              )}
            </Field>
            {wErr.form && <p role="alert" className="text-sm text-danger">{wErr.form}</p>}
            {wOk && <p role="status" className="text-sm text-success">{t.acPwSaved}</p>}
            <Button type="submit" pending={wPending} className="w-full">
              {t.acSavePw}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted">{t.acNoPassword}</p>
        )}
      </form>
    </>
  );
}

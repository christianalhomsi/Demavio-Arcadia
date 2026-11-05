"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { HallTime } from "@/components/domain/HallTime";
import { FormStatus } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { createPairingCodeAction, revokeHallServerAction, type PairingKind } from "../actions";
import type { HallServerInfo } from "../queries";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

export interface PairablePc {
  id: string;
  name: string;
}

/** Shows a freshly generated code once, big and copyable. Nothing is kept after the page is left. */
function CodeBox({ code, extra }: { code: string; extra?: { label: string; value: string } }) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState<string | null>(null);

  async function copy(value: string) {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((c) => (c === value ? null : c)), 2000);
    } catch {
      /* clipboard blocked: the code is on screen anyway */
    }
  }

  const row = (label: string, value: string, big: boolean) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p
          dir="ltr"
          className={
            big
              ? "select-all font-mono text-2xl font-semibold tracking-wider"
              : "select-all break-all font-mono text-xs"
          }
        >
          {value}
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => copy(value)}>
        {copied === value ? t.prCopied : t.prCopy}
      </Button>
    </div>
  );

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-neutral-bg p-3" role="status">
      {row(t.prCode, code, true)}
      {extra ? row(extra.label, extra.value, false) : null}
      <p className="text-xs text-muted">{t.prExpires}</p>
    </div>
  );
}

function GenerateCard({
  hallId,
  kind,
  title,
  description,
  children,
  disabled,
  extraFor,
}: {
  hallId: string;
  kind: PairingKind;
  title: string;
  description: string;
  children?: React.ReactNode;
  disabled?: boolean;
  extraFor?: () => { label: string; value: string } | undefined;
}) {
  const { t } = useI18n();
  const [code, setCode] = React.useState<string | null>(null);
  const [extra, setExtra] = React.useState<{ label: string; value: string } | undefined>();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    const r = await createPairingCodeAction(hallId, kind);
    setPending(false);
    if (r.ok) {
      setCode(r.data.code);
      setExtra(extraFor?.());
    } else {
      setCode(null);
      setError(r.message || t.prGenFail);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-0.5 text-sm text-muted">{description}</p>
      {children}
      <Button className="mt-3" onClick={generate} disabled={pending || disabled}>
        {code ? t.prRegenerate : t.prGenerate}
      </Button>
      {error ? <FormStatus state={{ ok: false, message: error }} /> : null}
      {code ? <CodeBox code={code} extra={extra} /> : null}
    </section>
  );
}

export function PairingPanel({
  hallId,
  timeZone,
  pcs,
  servers,
}: {
  hallId: string;
  timeZone: string;
  pcs: PairablePc[];
  servers: HallServerInfo[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pcId, setPcId] = React.useState("");
  const [revoking, setRevoking] = React.useState<HallServerInfo | null>(null);
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; message: string } | null>(null);

  async function revoke() {
    if (!revoking) return;
    setPending(true);
    const r = await revokeHallServerAction(hallId, revoking.id);
    setPending(false);
    setRevoking(null);
    setMsg(r.ok ? { ok: true, message: t.prRevoked } : { ok: false, message: r.message });
    if (r.ok) router.refresh();
  }

  return (
    <section aria-labelledby="pair-h" className="space-y-4">
      <div>
        <h2 id="pair-h" className="text-lg font-semibold">
          {t.prTitle}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{t.prIntro}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GenerateCard
          hallId={hallId}
          kind="hall_server"
          title={t.prServerTitle}
          description={t.prServerDesc}
        />
        <GenerateCard
          hallId={hallId}
          kind="agent"
          title={t.prAgentTitle}
          description={t.prAgentDesc}
          disabled={!pcId}
          extraFor={() => (pcId ? { label: t.prDeviceId, value: pcId } : undefined)}
        >
          {pcs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t.prNoPcs}</p>
          ) : (
            <div className="mt-2">
              <label htmlFor="pair-pc" className="mb-1 block text-sm font-medium">
                {t.prPickDevice}
              </label>
              <select
                id="pair-pc"
                className={selectCls}
                value={pcId}
                onChange={(e) => setPcId(e.target.value)}
              >
                <option value="">{t.prPickDevicePh}</option>
                {pcs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </GenerateCard>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-accent">{t.prServers}</h3>
        {servers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted">
            {t.prNoServers}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
            {servers.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-muted">
                    {t.prLastSeen}:{" "}
                    {s.lastSeenAt ? <HallTime value={s.lastSeenAt} timeZone={timeZone} /> : "—"}
                    {s.version ? <span dir="ltr"> · v{s.version}</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={s.revoked ? "danger" : s.online ? "success" : "neutral"}>
                    {s.revoked
                      ? t.prStatusRevoked
                      : s.online
                        ? t.prStatusOnline
                        : t.prStatusOffline}
                  </Badge>
                  {!s.revoked ? (
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(s)}>
                      {t.prRevoke}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {msg ? <FormStatus state={msg} /> : null}
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={tpl(t.prRevokeTitle, { name: revoking?.name ?? "" })}
        description={t.prRevokeDesc}
        confirmLabel={t.prRevoke}
        destructive
        pending={pending}
        onConfirm={revoke}
      />
    </section>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { Field, FormStatus } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  inviteMemberAction,
  revokeInvitationAction,
  setMemberStatusAction,
  updateMemberAction,
} from "../actions";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import type { HallMember, PendingInvitation } from "../queries";
import { GRANTABLE_PERMISSIONS, HALL_ROLES, inviteSchema } from "../schemas";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

export function EmployeesPanel({
  hallId,
  currentUserId,
  members,
  invitations,
}: {
  hallId: string;
  currentUserId: string;
  members: HallMember[];
  invitations: PendingInvitation[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = React.useState<HallMember | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<HallMember | null>(null);
  const [message, setMessage] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = React.useState(false);

  async function changeStatus(reason?: string) {
    if (!statusTarget) return;
    setPending(true);
    const next = statusTarget.status === "active" ? "inactive" : "active";
    const r = await setMemberStatusAction(
      hallId,
      statusTarget.membershipId,
      next,
      reason ?? "Reactivated",
    );
    setPending(false);
    setMessage(r.ok ? { ok: true, message: t.emAccessUpdated } : { ok: false, message: r.message });
    if (r.ok) {
      setStatusTarget(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.emTitle}</h1>
        <InviteDialog hallId={hallId} onDone={() => router.refresh()} />
      </div>
      <FormStatus state={message} />

      <section aria-labelledby="members-h">
        <h2 id="members-h" className="sr-only">
          {t.emMembers}
        </h2>
        <div className="stack-table overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.emCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  {t.colName}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colRole}
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
              {members.map((m) => (
                <tr key={m.membershipId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{m.displayName ?? m.email}</div>
                    {m.displayName && <div className="text-xs text-muted">{m.email}</div>}
                  </td>
                  <td className="px-4 py-2">
                    {m.role === "owner" ? t.emRoleOwner : t.emRoleEmployee}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={m.status === "active" ? "success" : "neutral"}>
                      {m.status === "active" ? t.emActive : t.emDeactivated}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-end">
                    {m.userId === currentUserId ? (
                      <span className="text-xs text-muted">{t.emYou}</span>
                    ) : (
                      <span className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                          {t.emEdit}
                        </Button>
                        <Button
                          size="sm"
                          variant={m.status === "active" ? "danger" : "secondary"}
                          onClick={() => setStatusTarget(m)}
                        >
                          {m.status === "active" ? t.emDeactivate : t.emReactivate}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="invites-h">
        <h2 id="invites-h" className="mb-2 text-lg font-medium">
          {t.emPendingInv}
        </h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted">{t.emNoInv}</p>
        ) : (
          <ul className="space-y-2">
            {invitations.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-3 text-sm"
              >
                <span>
                  {i.email} · <span>{i.role === "owner" ? t.emRoleOwner : t.emRoleEmployee}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await revokeInvitationAction(hallId, i.id);
                    setMessage(
                      r.ok ? { ok: true, message: t.emRevoked } : { ok: false, message: r.message },
                    );
                    router.refresh();
                  }}
                >
                  {t.emRevoke}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <EditMemberDialog
          key={editing.membershipId}
          hallId={hallId}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage({ ok: true, message: t.emUpdated });
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        title={statusTarget?.status === "active" ? t.emDeactTitle : t.emReactTitle}
        description={statusTarget?.status === "active" ? t.emDeactDesc : t.emReactDesc}
        confirmLabel={statusTarget?.status === "active" ? t.emDeactivate : t.emReactivate}
        destructive={statusTarget?.status === "active"}
        requireReason
        pending={pending}
        onConfirm={changeStatus}
      />
    </div>
  );
}

function InviteDialog({ hallId, onDone }: { hallId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"employee" | "owner">("employee");
  const [error, setError] = React.useState<string | undefined>();
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function reset(o: boolean) {
    setOpen(o);
    if (!o) {
      setEmail("");
      setRole("employee");
      setError(undefined);
      setLink(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setPending(true);
    setError(undefined);
    const r = await inviteMemberAction(hallId, parsed.data);
    setPending(false);
    if (!r.ok) return setError(r.fieldErrors?.email ?? r.message);
    setLink(`${window.location.origin}/invite/${r.data.token}`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <Button onClick={() => setOpen(true)}>{t.emInvite}</Button>
      <DialogContent title={t.emInvite} description={t.emInviteDesc}>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm">{t.emLinkNote}</p>
            <Input
              readOnly
              aria-label={t.emLinkLabel}
              value={link}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}>
                {t.emCopy}
              </Button>
              <DialogClose asChild>
                <Button>{t.emDone}</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field id="invite-email" label={t.emGoogleEmail} error={error}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field id="invite-role" label={t.colRole}>
              {(p) => (
                <select
                  {...p}
                  className={selectCls}
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                >
                  {HALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r === "owner" ? t.emRoleOwner : t.emRoleEmployee}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t.cmCancel}
                </Button>
              </DialogClose>
              <Button type="submit" pending={pending}>
                {t.emCreateInv}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({
  hallId,
  member,
  onClose,
  onSaved,
}: {
  hallId: string;
  member: HallMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [role, setRole] = React.useState<"employee" | "owner">(member.role);
  const [limit, setLimit] = React.useState(
    member.discountLimitMinor === null ? "" : (member.discountLimitMinor / 100).toFixed(2),
  );
  const [grants, setGrants] = React.useState<string[]>(member.grants);
  const [error, setError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const r = await updateMemberAction(hallId, member.membershipId, {
      role,
      discountLimit: limit,
      grants,
    });
    setPending(false);
    if (r.ok) onSaved();
    else setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={tpl(t.emEditTitle, {
          name: member.displayName ?? member.email ?? t.emEditFallback,
        })}
        description={t.emEditDesc}
      >
        <form onSubmit={save} className="space-y-3" noValidate>
          <Field id="edit-role" label={t.colRole}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                {HALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r === "owner" ? t.emRoleOwner : t.emRoleEmployee}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="edit-limit" label={t.emDiscount} hint={t.emDiscountHint}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            )}
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t.emExtraPerms}</legend>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {GRANTABLE_PERMISSIONS.map((perm) => (
                <label key={perm} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={grants.includes(perm)}
                    onChange={(e) =>
                      setGrants((g) =>
                        e.target.checked ? [...g, perm] : g.filter((x) => x !== perm),
                      )
                    }
                  />
                  <code className="text-xs">{perm}</code>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t.cmCancel}
            </Button>
            <Button type="submit" pending={pending}>
              {t.cmSave}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

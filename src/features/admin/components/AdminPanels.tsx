"use client";

import { Briefcase, CheckCircle2, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import {
  assignPlatformRoleAction,
  revokePlatformRoleAction,
  setUserStatusAction,
} from "../actions";
import { DeleteUserButton } from "./DeleteButtons";
import type { PlatformUserRow } from "../queries";
import { PLATFORM_ROLES, ROLE_KEYS } from "../schemas";

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  const { t } = useI18n();
  return (
    <Badge tone={status === "active" ? "success" : "warning"}>
      {status === "active" ? t.emActive : t.plInactive}
    </Badge>
  );
}

export function UsersList({
  users,
  timeZone,
  canManageAll,
}: {
  users: PlatformUserRow[];
  timeZone: string;
  canManageAll: boolean;
}) {
  void timeZone;
  const { t } = useI18n();
  if (users.length === 0) return <EmptyState title={t.plUsNone} />;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
      {users.map((u) => (
        <UserRow key={u.id} user={u} canManageAll={canManageAll} />
      ))}
    </ul>
  );
}

function UserRow({ user, canManageAll }: { user: PlatformUserRow; canManageAll: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [toggle, setToggle] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const next = user.status === "active" ? "inactive" : "active";

  async function revoke(role: string) {
    setError(undefined);
    const r = await revokePlatformRoleAction(user.id, role);
    if (r.ok) router.refresh();
    else setError(r.message);
  }

  return (
    <li className="space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate font-medium">{user.displayName ?? user.email}</span>
          {user.displayName && <span className="text-muted">{user.email}</span>}
        </span>
        <StatusBadge status={user.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {user.platformRoles.map((r) => (
          <span
            key={r}
            className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2.5 py-1 text-xs text-info"
          >
            {ROLE_KEYS[r] ? t[ROLE_KEYS[r]] : r}
            <button
              type="button"
              aria-label={tpl(t.plRemoveRoleAria, {
                role: ROLE_KEYS[r] ? t[ROLE_KEYS[r]] : r,
                email: user.email ?? "",
              })}
              className="relative grid h-6 w-6 place-items-center rounded-full before:absolute before:-inset-2.5 before:content-[''] hover:bg-black/10"
              onClick={() => revoke(r)}
            >
              ×
            </button>
          </span>
        ))}
        {user.hallRoles.map((r) => (
          <span
            key={r}
            className="inline-flex items-center rounded-full bg-success-bg px-2.5 py-1 text-xs text-success"
          >
            {r === "owner" ? t.roleHallOwner : t.roleHallEmployee}
          </span>
        ))}
        {user.platformRoles.length === 0 && user.hallRoles.length === 0 && (
          <span className="inline-flex items-center rounded-full bg-neutral-bg px-2.5 py-1 text-xs text-muted">
            {t.rolePlayer}
          </span>
        )}
        <span className="text-muted">{tpl(t.plHallsN, { n: user.hallsCount })}</span>
      </div>
      {canManageAll && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setToggle(true)}>
            {user.status === "active" ? t.plDeactAccount : t.plReactAccount}
          </Button>
          <DeleteUserButton
            userId={user.id}
            name={user.displayName ?? user.email ?? ""}
            email={user.email ?? ""}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={toggle}
        onOpenChange={setToggle}
        title={tpl(user.status === "active" ? t.plDeactUserTitle : t.plReactUserTitle, {
          email: user.email ?? "",
        })}
        description={user.status === "active" ? t.plDeactUserDesc : t.plReactUserDesc}
        confirmLabel={user.status === "active" ? t.emDeactivate : t.emReactivate}
        destructive={user.status === "active"}
        requireReason
        pending={pending}
        onConfirm={async (reason) => {
          setPending(true);
          const r = await setUserStatusAction(user.id, next, reason ?? "");
          setPending(false);
          if (r.ok) {
            setToggle(false);
            router.refresh();
          } else setError(r.fieldErrors?.reason ?? r.message);
        }}
      />
    </li>
  );
}

const ROLE_ICONS = {
  super_admin: ShieldCheck,
  sales_admin: UsersRound,
  sales_agent: Briefcase,
} as const;
const ROLE_DESC_KEYS = {
  super_admin: "plRoleDescSuper",
  sales_admin: "plRoleDescSalesAdmin",
  sales_agent: "plRoleDescSalesAgent",
} as const;

/** Give an existing account a platform role. Roles are cards with a one-line meaning, not a bare dropdown. */
export function AssignRoleButton({ canManageAll }: { canManageAll: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const roles = canManageAll
    ? PLATFORM_ROLES
    : PLATFORM_ROLES.filter((r) => r.value === "sales_agent");
  const first = roles[0]?.value ?? "sales_agent";
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<string>(first);
  const [pending, setPending] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | undefined>();
  const [formError, setFormError] = React.useState<string | undefined>();

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (!o) {
      setEmail("");
      setRole(first);
      setEmailError(undefined);
      setFormError(undefined);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setEmailError(undefined);
    setFormError(undefined);
    const r = await assignPlatformRoleAction(email, role);
    setPending(false);
    if (r.ok) {
      router.refresh();
      onOpenChange(false);
      return;
    }
    const fe = r.fieldErrors?.email;
    if (fe) setEmailError(fe.startsWith("No active account") ? t.plNoAccountErr : fe);
    else setFormError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button onClick={() => setOpen(true)}>{t.plAssignRole}</Button>
      <DialogContent title={t.plAssignRoleTitle} description={t.plAssignRoleDesc}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="ar-email" className="mb-1.5 block text-sm font-medium">
              {t.plAccountEmail}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="ar-email"
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="off"
                placeholder="name@example.com"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "ar-email-err" : undefined}
                className="pl-10 text-left"
              />
            </div>
            {emailError && (
              <p id="ar-email-err" role="alert" className="mt-1.5 text-sm text-danger">
                {emailError}
              </p>
            )}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t.colRole}</legend>
            <div className="space-y-1.5">
              {roles.map((r) => {
                const Icon = ROLE_ICONS[r.value];
                const on = role === r.value;
                return (
                  <label
                    key={r.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-2.5 transition-colors",
                      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                      on
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface hover:bg-neutral-bg",
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={on}
                      onChange={() => setRole(r.value)}
                      className="sr-only"
                    />
                    <Icon
                      className={cn("mt-0.5 h-5 w-5 shrink-0", on ? "text-accent" : "text-muted")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t[ROLE_KEYS[r.value]!]}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {t[ROLE_DESC_KEYS[r.value]]}
                      </span>
                    </span>
                    {on && <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" aria-hidden />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t.cmCancel}
              </Button>
            </DialogClose>
            <Button type="submit" pending={pending} disabled={email.trim() === ""}>
              {t.plAssignRole}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

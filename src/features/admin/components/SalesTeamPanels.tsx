"use client";

import { EmptyState } from "@/components/data/EmptyState";
import { ActionDialog } from "@/components/domain/ActionDialog";
import { HallTime } from "@/components/domain/HallTime";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { createSalesAccountAction, setSalesManagerAction } from "../actions";
import type { SalesMemberRow, SoldHallRow } from "../queries";
import { ROLE_KEYS } from "../schemas";
import { DeleteUserButton } from "./DeleteButtons";

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  const { t } = useI18n();
  return (
    <Badge tone={status === "active" ? "success" : "warning"}>
      {status === "active" ? t.emActive : t.plInactive}
    </Badge>
  );
}

export function SoldHallsList({ halls }: { halls: SoldHallRow[] }) {
  const { t } = useI18n();
  if (halls.length === 0) return <EmptyState title={t.stHallsNone} />;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
      {halls.map((h) => (
        <li key={h.hallId} className="space-y-1 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{h.hallName}</span>
            <span className="flex items-center gap-2">
              <StatusBadge status={h.hallStatus} />
            </span>
          </div>
          <p className="text-muted">
            {h.ownerEmail ? tpl(t.hwOwner, { email: h.ownerEmail }) : t.hwNoOwner}
          </p>
          <p>
            {h.soldById ? (
              <>
                {tpl(t.stSoldBy, { name: h.soldByName ?? h.soldByEmail ?? "" })}
                {h.soldByName && h.soldByEmail && (
                  <span className="text-muted"> ({h.soldByEmail})</span>
                )}
                {h.soldAt && (
                  <span className="text-muted">
                    {" · "}
                    {t.stSoldOn} <HallTime value={h.soldAt} timeZone="UTC" />
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">{t.stDirect}</span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Super admin picks the manager of an employee; the manager reviews that employee's hall requests. */
function AssignManagerButton({
  member,
  options,
}: {
  member: SalesMemberRow;
  options: { value: string; label: string }[];
}) {
  const { t } = useI18n();
  return (
    <ActionDialog
      trigger={t.stAssignManager}
      triggerVariant="secondary"
      triggerSize="sm"
      title={t.stAssignManager}
      description={member.displayName ?? member.email ?? ""}
      fields={[
        {
          name: "manager",
          label: t.stManagerField,
          type: "select",
          options: [{ value: "", label: t.stNoManager }, ...options],
          initial: options.some((o) => o.value === member.responsibleId)
            ? (member.responsibleId ?? "")
            : "",
        },
      ]}
      submitLabel={t.cmSave}
      action={(v) => setSalesManagerAction(member.userId, v.manager ?? "")}
    />
  );
}

export function SalesTeamList({
  team,
  managerOptions,
}: {
  team: SalesMemberRow[];
  managerOptions: { value: string; label: string }[];
}) {
  const { t } = useI18n();
  if (team.length === 0) return <EmptyState title={t.stTeamNone} />;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
      {team.map((m) => {
        const name = m.displayName ?? m.email ?? "";
        return (
          <li key={m.userId} className="flex items-center gap-3 p-4 text-sm">
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-accent"
            >
              {name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-medium">{name}</span>
                <Badge tone="neutral">{t[ROLE_KEYS[m.role]!]}</Badge>
                {m.status !== "active" && <StatusBadge status={m.status} />}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                <bdi>{m.email}</bdi>
                {m.username && (
                  <>
                    {" · "}
                    <bdi>@{m.username}</bdi>
                  </>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted sm:hidden">
                {m.responsibleName
                  ? tpl(t.stResponsible, { name: m.responsibleName })
                  : t.stNoResponsible}
              </p>
            </div>
            {m.role === "sales_agent" && (
              <AssignManagerButton member={m} options={managerOptions} />
            )}
            <DeleteUserButton userId={m.userId} name={name} email={m.email ?? ""} />
            <div className="hidden shrink-0 space-y-0.5 text-end text-xs text-muted sm:block">
              <p>{tpl(t.stHallsSold, { n: m.hallsSold })}</p>
              <p className="max-w-48 truncate">
                {m.responsibleName
                  ? tpl(t.stResponsible, { name: m.responsibleName })
                  : t.stNoResponsible}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AddSalesAccountButton({
  responsibleOptions,
}: {
  responsibleOptions: { value: string; label: string }[];
}) {
  const { t } = useI18n();
  const roles = ["sales_agent", "sales_admin"] as const;
  return (
    <ActionDialog
      trigger={t.stAdd}
      title={t.stAddTitle}
      description={t.stAddDesc}
      fields={[
        { name: "email", label: t.stFEmail, type: "email", maxLength: 254 },
        {
          name: "password",
          label: t.stFPassword,
          type: "password",
          hint: t.stFPasswordHint,
          maxLength: 72,
        },
        { name: "username", label: t.stFUsername, hint: t.stFUsernameHint, maxLength: 20 },
        { name: "displayName", label: t.stFName, maxLength: 120 },
        {
          name: "role",
          label: t.stFRole,
          type: "select",
          options: roles.map((r) => ({ value: r, label: t[ROLE_KEYS[r]!] })),
          initial: "sales_agent",
        },
        {
          name: "responsibleId",
          label: t.stFResp,
          type: "select",
          options: [{ value: "", label: t.stRespMe }, ...responsibleOptions],
          initial: "",
        },
      ]}
      submitLabel={t.stAdd}
      action={(v) =>
        createSalesAccountAction({
          email: v.email ?? "",
          password: v.password ?? "",
          username: v.username ?? "",
          displayName: v.displayName ?? "",
          role: v.role ?? "",
          responsibleId: v.responsibleId ?? "",
        })
      }
    />
  );
}

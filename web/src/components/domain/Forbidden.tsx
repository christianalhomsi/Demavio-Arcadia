"use client";

import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

/** Shown when the user is a member but lacks the required permission (403 semantics). */
export function Forbidden({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-muted" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">{t.cmAccessDenied}</h1>
      <p className="mt-2 text-sm text-muted">{message ?? t.cmForbiddenMsg}</p>
    </div>
  );
}

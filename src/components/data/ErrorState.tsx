"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export function ErrorState({
  title,
  message,
  reference,
  onRetry,
}: {
  title?: string;
  message?: string;
  /** Opaque support reference (e.g. error digest). Never put internal details here. */
  reference?: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-danger" aria-hidden />
      <h2 className="mt-3 text-base font-semibold text-danger">{title ?? t.cmSomethingWrong}</h2>
      <p className="mt-1 text-sm">{message ?? t.cmCouldntLoad}</p>
      {reference && (
        <p className="mt-1 text-xs text-muted">
          {t.cmReference}: {reference}
        </p>
      )}
      {onRetry && (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          {t.cmTryAgain}
        </Button>
      )}
    </div>
  );
}

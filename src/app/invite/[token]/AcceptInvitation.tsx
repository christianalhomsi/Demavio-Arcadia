"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { FormStatus } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/features/employees/actions";
import { useI18n } from "@/lib/i18n/client";

export function AcceptInvitation({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted">{t.invNote}</p>
      <Button
        pending={pending}
        onClick={async () => {
          setPending(true);
          const r = await acceptInvitationAction(token);
          setPending(false);
          if (r.ok) router.replace(`/halls/${r.data.hallId}`);
          else setStatus({ ok: false, message: r.message });
        }}
      >
        {t.invAccept}
      </Button>
      <FormStatus state={status} />
    </div>
  );
}

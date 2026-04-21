"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import WorkingHoursEditor from "@/components/ui/working-hours-editor";
import type { WorkingHours } from "@/types/hall";
import { toast } from "sonner";

type Props = {
  hallId: string;
  initialHours: WorkingHours[];
};

export default function WorkingHoursSection({ hallId, initialHours }: Props) {
  const t = useTranslations("settings");
  const [hours, setHours] = useState<WorkingHours[]>(initialHours);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/halls/${hallId}/working-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ working_hours: hours }),
      });

      if (!res.ok) throw new Error();
      toast.success(t("workingHoursUpdated"));
    } catch {
      toast.error(t("updateError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-muted-foreground" />
        <div>
          <h2 className="text-base font-semibold">{t("workingHours")}</h2>
          <p className="text-xs text-muted-foreground">{t("workingHoursDesc")}</p>
        </div>
      </div>

      <WorkingHoursEditor value={hours} onChange={setHours} />

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? t("saving") : t("saveChanges")}
      </Button>
    </div>
  );
}

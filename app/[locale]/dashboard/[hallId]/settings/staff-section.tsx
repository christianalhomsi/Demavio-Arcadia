"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type StaffMember = {
  user_id: string;
  role: string;
  email: string;
};

type Props = {
  staff: StaffMember[];
};

export default function StaffSection({ staff }: Props) {
  const t = useTranslations("settings");

  const getRoleBadge = (role: string) => {
    if (role === "hall_manager") return <Badge variant="default">{t("manager")}</Badge>;
    if (role === "hall_staff") return <Badge variant="secondary">{t("staff")}</Badge>;
    return <Badge variant="outline">{role}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" />
        <div>
          <h2 className="text-base font-semibold">{t("hallStaff")}</h2>
          <p className="text-xs text-muted-foreground">{t("hallStaffDesc")}</p>
        </div>
      </div>

      {staff.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t("noStaff")}</p>
      ) : (
        <div className="space-y-2">
          {staff.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20"
            >
              <span className="text-sm">{member.email}</span>
              {getRoleBadge(member.role)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

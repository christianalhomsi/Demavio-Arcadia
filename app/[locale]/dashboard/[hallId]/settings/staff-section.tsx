"use client";

import { useState } from "react";
import { Users, UserPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type StaffMember = {
  user_id: string;
  role: string;
  email: string;
  username: string;
};

type Props = {
  hallId: string;
  staff: StaffMember[];
  isManager: boolean;
  locale: string;
};

export default function StaffSection({ hallId, staff, isManager, locale }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("hall_staff");
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState(staff);

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      ar: {
        hallStaff: "موظفي الصالة",
        hallStaffDesc: "الموظفين المعينين لهذه الصالة",
        addStaff: "إضافة موظف",
        noStaff: "لا يوجد موظفين",
        manager: "مدير",
        staff: "موظف",
        email: "البريد الإلكتروني",
        role: "الدور",
        cancel: "إلغاء",
        add: "إضافة",
        adding: "جاري الإضافة...",
        staffAdded: "تم إضافة الموظف بنجاح",
        staffRemoved: "تم حذف الموظف",
        invalidEmail: "البريد الإلكتروني غير صالح",
        addFailed: "فشل إضافة الموظف",
        removeFailed: "فشل حذف الموظف",
        onlyManagers: "فقط المدراء يمكنهم إضافة موظفين",
      },
      en: {
        hallStaff: "Hall Staff",
        hallStaffDesc: "Staff members assigned to this hall",
        addStaff: "Add Staff",
        noStaff: "No staff members",
        manager: "Manager",
        staff: "Staff",
        email: "Email",
        role: "Role",
        cancel: "Cancel",
        add: "Add",
        adding: "Adding...",
        staffAdded: "Staff member added successfully",
        staffRemoved: "Staff member removed",
        invalidEmail: "Invalid email",
        addFailed: "Failed to add staff",
        removeFailed: "Failed to remove staff",
        onlyManagers: "Only managers can add staff",
      },
    };
    return translations[locale]?.[key] || key;
  };

  const getRoleBadge = (role: string) => {
    if (role === "hall_manager") return <Badge variant="default">{t("manager")}</Badge>;
    if (role === "hall_staff") return <Badge variant="secondary">{t("staff")}</Badge>;
    return <Badge variant="outline">{role}</Badge>;
  };

  const handleAdd = async () => {
    if (!email || !email.includes("@")) {
      toast.error(t("invalidEmail"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, hall_id: hallId, role }),
      });

      if (!res.ok) throw new Error();
      
      const data = await res.json();
      toast.success(t("staffAdded"));
      
      // Add to local state
      setStaffList([...staffList, { user_id: data.user_id, role, email, username: email }]);
      setEmail("");
      setRole("hall_staff");
      setShowAddForm(false);
    } catch {
      toast.error(t("addFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff-assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, hall_id: hallId }),
      });

      if (!res.ok) throw new Error();
      
      toast.success(t("staffRemoved"));
      setStaffList(staffList.filter(s => s.user_id !== userId));
    } catch {
      toast.error(t("removeFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-border/40"
          style={{ background: "oklch(0.55 0.26 280 / 0.05)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "oklch(0.55 0.26 280 / 0.15)",
                border: "1px solid oklch(0.55 0.26 280 / 0.25)",
              }}
            >
              <Users size={18} style={{ color: "oklch(0.55 0.26 280)" }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t("hallStaff")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("hallStaffDesc")}</p>
            </div>
          </div>
          {isManager && (
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              size="sm"
              className="gap-2"
              style={{
                background: "oklch(0.55 0.26 280)",
                color: "white",
              }}
            >
              <UserPlus size={16} />
              {t("addStaff")}
            </Button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {showAddForm && isManager && (
            <div className="p-5 rounded-xl border-2 border-dashed border-border/60 bg-muted/30 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("email")}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@example.com"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("role")}</Label>
                <Select value={role} onValueChange={(value) => setRole(value || "hall_staff")} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hall_staff">{t("staff")}</SelectItem>
                    <SelectItem value="hall_manager">{t("manager")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAdd}
                  disabled={loading}
                  className="flex-1"
                  style={{
                    background: "oklch(0.55 0.26 280)",
                    color: "white",
                  }}
                >
                  {loading ? t("adding") : t("add")}
                </Button>
                <Button
                  onClick={() => setShowAddForm(false)}
                  variant="outline"
                  disabled={loading}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          )}

          {staffList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 italic">{t("noStaff")}</p>
          ) : (
            <div className="space-y-3">
              {staffList.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
                      {member.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{member.username}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(member.role)}
                    {isManager && (
                      <Button
                        onClick={() => handleRemove(member.user_id)}
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={loading}
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getHalls } from "@/services/halls";
import AdminUsersClient from "./admin-users-client";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Admin — Users" };

export default async function AdminUsersPage() {
  const t = await getTranslations("admin");
  const halls = await getHalls();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "oklch(0.82 0.14 200 / 0.12)", border: "1px solid oklch(0.82 0.14 200 / 0.25)" }}>
          <Users size={20} style={{ color: "oklch(0.82 0.14 200)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("usersPage")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("usersPageDesc")}</p>
        </div>
      </div>

      <AdminUsersClient halls={halls} />
    </div>
  );
}

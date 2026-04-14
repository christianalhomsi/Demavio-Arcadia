import type { Metadata } from "next";
import { getHalls } from "@/services/halls";
import { Separator } from "@/components/ui/separator";
import AdminUsersClient from "./admin-users-client";

export const metadata: Metadata = { title: "Admin — Users" };

export default async function AdminUsersPage() {
  const halls = await getHalls();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Invite accounts and grant hall access with a role.
        </p>
      </div>
      <Separator className="opacity-40" />
      <AdminUsersClient halls={halls} />
    </div>
  );
}

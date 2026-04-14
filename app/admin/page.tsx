import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Admin" };

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Super admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage halls, devices, and staff access.
        </p>
      </div>
      <Separator className="opacity-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Halls</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Create halls with devices and optional staff assignments.</p>
            <Link
              href="/admin/halls/new"
              className="inline-flex text-primary font-medium hover:underline"
            >
              Create hall
            </Link>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Users</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Invite users and assign them to halls with a role.</p>
            <Link
              href="/admin/users"
              className="inline-flex text-primary font-medium hover:underline"
            >
              Open users
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

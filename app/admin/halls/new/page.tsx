import type { Metadata } from "next";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import NewHallForm from "./new-hall-form";

export const metadata: Metadata = { title: "Admin — New hall" };

export default function AdminNewHallPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/halls"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to halls
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">New hall</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a hall, provision devices, and optionally assign a staff member.
        </p>
      </div>
      <Separator className="opacity-40" />
      <NewHallForm />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getHalls } from "@/services/halls";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Halls" };

export default async function AdminHallsPage() {
  const halls = await getHalls();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Halls</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All gaming halls in the system.
          </p>
        </div>
        <Link
          href="/admin/halls/new"
          className={cn(buttonVariants({ variant: "default" }))}
        >
          New hall
        </Link>
      </div>
      <Separator className="opacity-40" />
      {halls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No halls yet.</p>
      ) : (
        <ul className="space-y-2">
          {halls.map((h) => (
            <li key={h.id}>
              <Card className="border-border/60">
                <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.address ?? "—"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/dashboard/${h.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Dashboard
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

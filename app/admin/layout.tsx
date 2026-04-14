import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/services/access";
import { Separator } from "@/components/ui/separator";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!(await isSuperAdmin(user.id))) redirect("/halls");

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-5 h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/admin" className="text-sm font-semibold text-foreground">
          Admin
        </Link>
        <Separator orientation="vertical" className="h-5 opacity-30" />
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/admin/halls"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Halls
          </Link>
          <Link
            href="/admin/halls/new"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            New hall
          </Link>
          <Link
            href="/admin/users"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Users
          </Link>
        </nav>
        <div className="flex-1" />
        <Link
          href="/halls"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Player app
        </Link>
      </header>
      <div className="page-shell max-w-4xl">{children}</div>
    </div>
  );
}

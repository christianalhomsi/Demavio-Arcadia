import { notFound, redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { verifyStaffHallAccess } from "@/services/staff";
import DashboardHeader from "@/components/layout/dashboard-header";
import DashboardSidebar from "@/components/layout/dashboard-sidebar";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ hallId: string; locale: string }>;
}) {
  const { hallId, locale } = await params;
  const supabase = await getServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const access = await verifyStaffHallAccess(user.id, hallId);
  if (!access.success) notFound();

  const { data: hall } = await supabase
    .from("halls")
    .select("name")
    .eq("id", hallId)
    .single();

  if (!hall) notFound();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <DashboardHeader hallName={hall.name} hallId={hallId} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 shrink-0 border-r border-border/60 overflow-y-auto bg-card/50 hidden md:block">
          <DashboardSidebar hallId={hallId} />
        </aside>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

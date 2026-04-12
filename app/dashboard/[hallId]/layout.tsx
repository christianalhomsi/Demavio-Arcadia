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
  params: { hallId: string };
}) {
  const { hallId } = params;
  const supabase = await getServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await verifyStaffHallAccess(user.id, hallId);
  if (!access.success) notFound();

  const { data: hall } = await supabase
    .from("halls")
    .select("name")
    .eq("id", hallId)
    .single();

  if (!hall) notFound();

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--color-bg)" }}>
      <DashboardHeader hallName={hall.name} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-48 shrink-0 border-r overflow-y-auto"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
          <DashboardSidebar hallId={hallId} />
        </aside>
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

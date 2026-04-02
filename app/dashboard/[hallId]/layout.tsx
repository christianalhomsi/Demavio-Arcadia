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
  const supabase = getServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await verifyStaffHallAccess(user.id, hallId);
  if (!access.success) notFound();

  const { data: hall } = await supabase
    .from("halls")
    .select("name")
    .eq("id", hallId)
    .eq("is_active", true)
    .single();

  if (!hall) notFound();

  return (
    <div style={root}>
      <DashboardHeader hallName={hall.name} />
      <div style={body}>
        <aside style={sidebar}>
          <DashboardSidebar hallId={hallId} />
        </aside>
        <main style={main}>{children}</main>
      </div>
    </div>
  );
}

const root: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: "100vh",
  fontFamily: "system-ui, sans-serif",
  background: "#f9fafb",
};

const body: React.CSSProperties = {
  display: "flex",
  flex: 1,
  overflow: "hidden",
};

const sidebar: React.CSSProperties = {
  width: "200px",
  flexShrink: 0,
  borderRight: "1px solid #e5e7eb",
  background: "#fff",
  overflowY: "auto",
};

const main: React.CSSProperties = {
  flex: 1,
  padding: "2rem",
  overflowY: "auto",
};

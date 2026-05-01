import { notFound, redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { verifyStaffHallAccess } from "@/services/staff";
import DashboardLayoutClient from "./dashboard-layout-client";

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
  if (!user) redirect(`/${locale}/auth/login`);

  let access, hall;
  try {
    access = await verifyStaffHallAccess(user.id, hallId);
    if (!access.success) notFound();

    const { data } = await supabase
      .from("halls")
      .select("name")
      .eq("id", hallId)
      .single();
    hall = data;
  } catch (e) {
    console.error("[DashboardLayout] Server error:", e);
    notFound();
  }

  if (!hall) notFound();

  return <DashboardLayoutClient hallName={hall.name} hallId={hallId}>{children}</DashboardLayoutClient>;
}

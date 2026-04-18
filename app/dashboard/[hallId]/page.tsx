import { redirect } from "next/navigation";

export default async function DashboardRootPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  redirect(`/dashboard/${hallId}/overview`);
}

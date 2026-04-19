import { redirect } from "next/navigation";

export default async function DashboardRootPage({ params }: { params: Promise<{ hallId: string; locale: string }> }) {
  const { hallId, locale } = await params;
  redirect(`/${locale}/dashboard/${hallId}/overview`);
}

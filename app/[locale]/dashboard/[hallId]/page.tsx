import { redirect } from "next-intl/server";

export default async function DashboardRootPage({ params }: { params: Promise<{ hallId: string; locale: string }> }) {
  const { hallId, locale } = await params;
  redirect({ href: `/dashboard/${hallId}/overview`, locale });
}

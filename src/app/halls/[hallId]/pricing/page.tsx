import { Suspense } from "react";
import { notFound } from "next/navigation";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { listDeviceStatus } from "@/features/devices/queries";
import { getHallCurrency } from "@/features/invoices/queries";
import { PricingEditor } from "@/features/pricing/components/PricingEditor";
import { WindowsPanel } from "@/features/pricing/components/WindowsPanel";
import { getBillingRules, getPricing } from "@/features/pricing/queries";
import { listPricingWindows } from "@/features/pricing/windowQueries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Pricing" };

async function Pricing({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/pricing"));
  const [pricing, billing, devices, currency, windows] = await Promise.all([
    getPricing(hallId),
    getBillingRules(hallId),
    listDeviceStatus(hallId),
    getHallCurrency(hallId),
    listPricingWindows(hallId),
  ]);
  if (!pricing || !billing || !devices || !currency || !windows) notFound();
  const { t } = await getT();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.pcTitle}</h1>
      <PricingEditor
        hallId={hallId}
        currency={currency}
        rules={pricing.rules}
        incrementMinutes={billing.incrementMinutes}
        minBillableMinutes={billing.minBillableMinutes}
      />
      <WindowsPanel
        hallId={hallId}
        currency={currency}
        windows={windows}
        categories={[
          ...new Set(
            [...pricing.rules.map((r) => r.category), ...devices.map((d) => d.category)].filter(
              (c): c is string => !!c,
            ),
          ),
        ]}
      />
    </div>
  );
}

export default function PricingPage({ params }: PageProps<"/halls/[hallId]/pricing">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Pricing params={params} />
    </Suspense>
  );
}

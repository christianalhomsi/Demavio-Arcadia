import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { permissionForPath } from "@/components/shell/nav";
import { TablePageSkeleton } from "@/components/ui/skeleton";
import { DiscountsPanel } from "@/features/discounts/components/DiscountsPanel";
import { listDiscounts } from "@/features/discounts/queries";
import { getHallTimeZone } from "@/features/halls/queries";
import { getHallCurrency } from "@/features/invoices/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Discounts" };

async function Discounts({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/discounts"));
  const [discounts, currency, timeZone] = await Promise.all([
    listDiscounts(hallId),
    getHallCurrency(hallId),
    getHallTimeZone(hallId),
  ]);
  if (!discounts || !currency) return <ErrorState message={(await getT()).t.dcLoadFail} />;
  return (
    <DiscountsPanel hallId={hallId} currency={currency} timeZone={timeZone} discounts={discounts} />
  );
}

export default function DiscountsPage({ params }: PageProps<"/halls/[hallId]/discounts">) {
  return (
    <Suspense fallback={<TablePageSkeleton cols={5} />}>
      <Discounts params={params} />
    </Suspense>
  );
}

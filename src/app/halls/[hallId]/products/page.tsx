import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { permissionForPath } from "@/components/shell/nav";
import { TablePageSkeleton } from "@/components/ui/skeleton";
import { getHallCurrency } from "@/features/invoices/queries";
import { ProductsPanel } from "@/features/products/components/ProductsPanel";
import { listProducts } from "@/features/products/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Products" };

async function Products({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/products"));
  const [products, currency] = await Promise.all([listProducts(hallId), getHallCurrency(hallId)]);
  if (!products || !currency) return <ErrorState message={(await getT()).t.pdLoadFail} />;
  return <ProductsPanel hallId={hallId} currency={currency} products={products} />;
}

export default function ProductsPage({ params }: PageProps<"/halls/[hallId]/products">) {
  return (
    <Suspense fallback={<TablePageSkeleton cols={4} />}>
      <Products params={params} />
    </Suspense>
  );
}

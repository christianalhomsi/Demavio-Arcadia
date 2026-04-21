import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Package } from "lucide-react";
import ProductsClient from "./products-client";

export const metadata: Metadata = { title: "Products | Gaming Hub" };

export default async function ProductsPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const t = await getTranslations("products");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="page-shell py-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}
            >
              <Package size={20} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none">{t("title")}</h1>
              <p className="text-xs text-muted-foreground mt-1">{t("description")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="page-shell py-6">
        <ProductsClient hallId={hallId} />
      </div>
    </div>
  );
}

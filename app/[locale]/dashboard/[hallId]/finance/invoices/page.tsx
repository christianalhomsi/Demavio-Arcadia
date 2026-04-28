import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Receipt, FileText } from "lucide-react";
import type { Invoice } from "@/types/invoice";
import InvoicesClient from "./invoices-client";

export const metadata: Metadata = { title: "Invoices" };

async function InvoicesContent({ hallId }: { hallId: string }) {
  const supabase = await getServerClient();
  const t = await getTranslations("dashboard");

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      *,
      devices(name),
      profiles(username)
    `)
    .eq("hall_id", hallId)
    .order("created_at", { ascending: false })
    .limit(50);

  const invoiceList = (invoices ?? []) as (Invoice & {
    devices: { name: string } | null;
    profiles: { username: string } | null;
  })[];

  return (
    <Card className="border-border/60 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText size={16} />
          {t("invoices")}
        </CardTitle>
      </CardHeader>
      <Separator className="opacity-40" />
      <CardContent className="pt-4">
        {invoiceList.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
          </div>
        ) : (
          <InvoicesClient invoices={invoiceList} />
        )}
      </CardContent>
    </Card>
  );
}

function InvoicesSkeleton() {
  return <Skeleton className="h-96 rounded-xl skeleton-shimmer" />;
}

export default async function InvoicesPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const t = await getTranslations("dashboard");
  
  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <Receipt size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">{t("invoices")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("viewAllInvoices")}</p>
        </div>
      </div>
      <Separator className="opacity-40" />
      <Suspense fallback={<InvoicesSkeleton />}>
        <InvoicesContent hallId={hallId} />
      </Suspense>
    </div>
  );
}

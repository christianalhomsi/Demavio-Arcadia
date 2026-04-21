import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Receipt, FileText } from "lucide-react";
import type { Invoice } from "@/types/invoice";

export const metadata: Metadata = { title: "Invoices" };

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtDuration(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

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
      {invoiceList.length === 0 ? (
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2.5 text-left section-heading">{t("device")}</th>
                <th className="px-4 py-2.5 text-left section-heading">{t("player")}</th>
                <th className="px-4 py-2.5 text-left section-heading">{t("duration")}</th>
                <th className="px-4 py-2.5 text-left section-heading">{t("sessionCost")}</th>
                <th className="px-4 py-2.5 text-left section-heading">{t("items")}</th>
                <th className="px-4 py-2.5 text-left section-heading">{t("total")}</th>
                <th className="px-4 py-2.5 text-left section-heading">{t("date")}</th>
              </tr>
            </thead>
            <tbody>
              {invoiceList.map((invoice) => (
                <tr key={invoice.id} className="table-row-hover border-b border-border/20 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {invoice.devices?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {invoice.profiles?.username ?? "Guest"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmtDuration(invoice.duration_hours)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    ${fmtCurrency(invoice.session_price)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    ${fmtCurrency(invoice.items_total)}
                    {invoice.items.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({invoice.items.length})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-primary">
                    ${fmtCurrency(invoice.total_price)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {fmtDate(invoice.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { calculateExpectedBalance } from "@/lib/cash-register";
import type { CashRegister } from "@/types/cash-register";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import OpenRegisterForm from "./open-register-form";
import CloseRegisterForm from "./close-register-form";

export const metadata: Metadata = { title: "Cash Register | Arcadia" };

async function getOpenRegister(hallId: string): Promise<CashRegister | null> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("cash_registers")
    .select("id, hall_id, opened_by, opening_balance, status, opened_at, closed_at")
    .eq("hall_id", hallId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function getTotalIncome(hallId: string): Promise<number> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("payments")
    .select("amount, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("sessions.devices.hall_id", hallId);
  return ((data ?? []) as { amount: number }[]).reduce((sum, p) => sum + p.amount, 0);
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function RegisterContent({ hallId }: { hallId: string }) {
  const [register, totalIncome, t] = await Promise.all([
    getOpenRegister(hallId),
    getTotalIncome(hallId),
    getTranslations("dashboard"),
  ]);

  if (!register) {
    return (
      <Card className="border-border/60 max-w-lg">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              {t("closed")}
            </span>
            <p className="text-sm text-muted-foreground">{t("noRegisterOpen")}</p>
          </div>
          <Separator className="opacity-40" />
          <OpenRegisterForm hallId={hallId} />
        </CardContent>
      </Card>
    );
  }

  const expectedBalance = calculateExpectedBalance(register.opening_balance, totalIncome, 0);

  return (
    <Card className="border-border/60 max-w-lg">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/15 text-green-400">
            {t("open")}
          </span>
          <p className="text-sm text-muted-foreground">
            {t("opened")} {new Date(register.opened_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <Separator className="opacity-40" />
        <div className="rounded-lg bg-muted/40 p-4 space-y-2.5">
          {[
            { label: t("openingBalance"),  value: `$${fmt(register.opening_balance)}` },
            { label: t("totalIncome"),     value: `$${fmt(totalIncome)}` },
            { label: t("expectedBalance"), value: `$${fmt(expectedBalance)}`, accent: true },
          ].map(({ label, value, accent }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`text-sm tabular-nums ${accent ? "font-bold text-foreground" : "font-medium"}`}>{value}</span>
            </div>
          ))}
        </div>
        <CloseRegisterForm registerId={register.id} hallId={hallId} expectedBalance={expectedBalance} />
      </CardContent>
    </Card>
  );
}

function RegisterSkeleton() {
  return <Skeleton className="h-64 max-w-lg rounded-xl skeleton-shimmer" />;
}

export default async function RegisterPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const t = await getTranslations("dashboard");
  return (
    <div className="page-shell">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("cashRegister")}</h1>
        <Link href={`/dashboard/${hallId}/finance`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">
          <ChevronLeft size={15} />
          {t("financeOverview")}
        </Link>
      </div>
      <Suspense fallback={<RegisterSkeleton />}>
        <RegisterContent hallId={hallId} />
      </Suspense>
    </div>
  );
}

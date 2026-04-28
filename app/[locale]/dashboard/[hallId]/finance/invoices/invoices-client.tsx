"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

type InvoiceWithRelations = {
  id: string;
  is_paid: boolean;
  payment_method: string | null;
  total_price: number;
  session_price: number;
  items_total: number;
  duration_hours: number;
  created_at: string;
  devices: { name: string } | null;
  profiles: { username: string } | null;
  items: any[];
};

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

export default function InvoicesClient({ invoices }: { invoices: InvoiceWithRelations[] }) {
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [payingId, setPayingId] = useState<string | null>(null);
  const router = useRouter();

  const filteredInvoices = invoices.filter(inv => {
    if (filter === 'paid') return inv.is_paid;
    if (filter === 'unpaid') return !inv.is_paid;
    return true;
  });

  const handlePay = async (invoiceId: string) => {
    setPayingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'cash' }),
      });

      if (!res.ok) {
        let errMsg = 'فشل الدفع';
        try {
          const data = await res.json();
          errMsg = data.error || data.message || errMsg;
        } catch {
          errMsg = (await res.text().catch(() => '')) || `HTTP ${res.status}`;
        }
        throw new Error(errMsg);
      }

      toast.success('تم الدفع بنجاح');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    } finally {
      setPayingId(null);
    }
  };

  return (
    <>
      <div className="flex gap-2 mb-4">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          الكل ({invoices.length})
        </Button>
        <Button
          variant={filter === 'paid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('paid')}
        >
          مدفوعة ({invoices.filter(i => i.is_paid).length})
        </Button>
        <Button
          variant={filter === 'unpaid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unpaid')}
        >
          غير مدفوعة ({invoices.filter(i => !i.is_paid).length})
        </Button>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-muted-foreground">لا توجد فواتير</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2.5 text-left section-heading">الجهاز</th>
                <th className="px-4 py-2.5 text-left section-heading">اللاعب</th>
                <th className="px-4 py-2.5 text-left section-heading">المدة</th>
                <th className="px-4 py-2.5 text-left section-heading">تكلفة الجلسة</th>
                <th className="px-4 py-2.5 text-left section-heading">العناصر</th>
                <th className="px-4 py-2.5 text-left section-heading">الإجمالي</th>
                <th className="px-4 py-2.5 text-left section-heading">الحالة</th>
                <th className="px-4 py-2.5 text-left section-heading">التاريخ</th>
                <th className="px-4 py-2.5 text-left section-heading">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="table-row-hover border-b border-border/20 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {invoice.devices?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {invoice.profiles?.username ?? "ضيف"}
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
                      <span className="text-xs text-muted-foreground ms-1">
                        ({invoice.items.length})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-primary">
                    ${fmtCurrency(invoice.total_price)}
                  </td>
                  <td className="px-4 py-3">
                    {invoice.is_paid ? (
                      <Badge variant="default" className="bg-green-500/15 text-green-400 hover:bg-green-500/20">
                        مدفوعة
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-red-500/15 text-red-400 hover:bg-red-500/20">
                        غير مدفوعة
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {fmtDate(invoice.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {!invoice.is_paid && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePay(invoice.id)}
                        disabled={payingId === invoice.id}
                      >
                        {payingId === invoice.id ? (
                          <>
                            <Loader2 size={14} className="mr-1 animate-spin" />
                            جاري الدفع...
                          </>
                        ) : (
                          <>
                            <DollarSign size={14} className="mr-1" />
                            دفع
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { getReceivables } from "@/server/finance/receivables";
import { getBillingSchedule } from "@/server/finance/billing-schedule";
import { BillingScheduleCard } from "@/components/finance/billing-schedule-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const INDICATOR_STYLES: Record<string, string> = {
  not_due: "bg-muted text-muted-foreground",
  due_soon: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  paid: "bg-success/15 text-success",
};
const INDICATOR_LABEL: Record<string, string> = {
  not_due: "Not Due", due_soon: "Due Soon", overdue: "Overdue", paid: "Paid",
};

export default async function ReceivablesPage() {
  const [rows, billingSchedule] = await Promise.all([getReceivables(), getBillingSchedule()]);
  const totalOutstanding = rows.filter((r) => r.indicator !== "paid").reduce((s, r) => s + r.outstanding, 0);
  const overdueCount = rows.filter((r) => r.indicator === "overdue").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Accounts Receivable</h1>
        <p className="text-sm text-muted-foreground">{formatCurrency(totalOutstanding)} outstanding · {overdueCount} overdue</p>
      </div>

      {/* Sudah ditagih tapi belum dibayar (di atas) vs BELUM ditagih sama
          sekali (di sini) — dua hal yang berbeda, keduanya perlu terlihat di
          halaman yang sama supaya Finance tidak harus buka tab Documents tiap
          project satu-satu untuk tahu kapan tahap penagihan berikutnya jatuh
          tempo. */}
      <BillingScheduleCard rows={billingSchedule} />

      {rows.length === 0 ? <EmptyState title="No receivables to show" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Invoice</TableHead><TableHead>Invoice Date</TableHead><TableHead>Due Date</TableHead><TableHead>Tagihan Invoice</TableHead><TableHead>Paid</TableHead><TableHead>Outstanding</TableHead><TableHead>Days Overdue</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.customer.companyName}</TableCell>
                <TableCell>
                  <Link href={`/finance/invoices/${r.id}`} className="font-mono text-xs hover:underline">{r.number}</Link>
                  {r.dpPercent != null && Number(r.dpPercent) > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">DP {Number(r.dpPercent)}%</span>
                  )}
                </TableCell>
                <TableCell>{formatDate(r.invoiceDate)}</TableCell>
                <TableCell>{formatDate(r.dueDate)}</TableCell>
                <TableCell>{formatCurrency(r.dueAmount)}</TableCell>
                <TableCell>{formatCurrency(Number(r.paidAmount))}</TableCell>
                <TableCell>{formatCurrency(r.outstanding)}</TableCell>
                <TableCell>{r.indicator === "overdue" ? r.daysOverdue : "-"}</TableCell>
                <TableCell><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", INDICATOR_STYLES[r.indicator])}>{INDICATOR_LABEL[r.indicator]}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

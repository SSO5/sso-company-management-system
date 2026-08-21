import Link from "next/link";
import { listInvoices } from "@/server/finance/invoices";
import { getBillingSchedule } from "@/server/finance/billing-schedule";
import { BillingScheduleCard } from "@/components/finance/billing-schedule-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { invoiceDueAmount, invoiceOutstanding, looksLikeUnrecordedWithholding } from "@/lib/workflows/calculations";
import { Plus } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SUBMITTED: "warning", APPROVED: "success", REJECTED: "destructive",
  ISSUED: "outline", PARTIALLY_PAID: "warning", PAID: "success", OVERDUE: "destructive", CANCELLED: "secondary",
};

export default async function InvoicesPage() {
  const [invoices, billingSchedule] = await Promise.all([listInvoices(), getBillingSchedule()]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Invoices</h1><p className="text-sm text-muted-foreground">{invoices.length} invoice(s)</p></div>
        <Link href="/finance/invoices/new"><Button><Plus className="h-4 w-4" /> New Invoice</Button></Link>
      </div>

      {/* Belum ditagih sama sekali — bukan invoice yang sudah ada di tabel
          bawah, justru sebaliknya: project mana yang PO-nya masih punya sisa
          yang belum pernah dibuatkan invoice. Konteks yang paling relevan
          persis sebelum menekan "New Invoice". */}
      <BillingScheduleCard rows={billingSchedule} compact title="Belum Dibuatkan Invoice" />

      {invoices.length === 0 ? <EmptyState title="No invoices yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Customer</TableHead><TableHead>Project</TableHead><TableHead>Due Date</TableHead><TableHead>Tagihan Invoice</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/finance/invoices/${inv.id}`} className="hover:underline">{inv.number}</Link>
                  {inv.dpPercent != null && Number(inv.dpPercent) > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">DP {Number(inv.dpPercent)}%</span>
                  )}
                </TableCell>
                <TableCell>{inv.customer.companyName}</TableCell>
                <TableCell>{inv.project?.number ?? "-"}</TableCell>
                <TableCell>{formatDate(inv.dueDate)}</TableCell>
                <TableCell>{formatCurrency(invoiceDueAmount(inv))}</TableCell>
                <TableCell>{formatCurrency(Number(inv.paidAmount))}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                  {(inv.status === "OVERDUE" || inv.status === "PARTIALLY_PAID") && invoiceOutstanding(inv) > 0 && (
                    <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                      Sisa {formatCurrency(invoiceOutstanding(inv))}
                      {looksLikeUnrecordedWithholding(inv) && " — cek PPh?"}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

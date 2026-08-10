import Link from "next/link";
import { listInvoices } from "@/server/finance/invoices";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "secondary", SUBMITTED: "warning", APPROVED: "success", REJECTED: "destructive",
  ISSUED: "outline", PARTIALLY_PAID: "warning", PAID: "success", OVERDUE: "destructive", CANCELLED: "secondary",
};

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Invoices</h1><p className="text-sm text-muted-foreground">{invoices.length} invoice(s)</p></div>
        <Link href="/finance/invoices/new"><Button><Plus className="h-4 w-4" /> New Invoice</Button></Link>
      </div>
      {invoices.length === 0 ? <EmptyState title="No invoices yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Customer</TableHead><TableHead>Project</TableHead><TableHead>Due Date</TableHead><TableHead>Grand Total</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs"><Link href={`/finance/invoices/${inv.id}`} className="hover:underline">{inv.number}</Link></TableCell>
                <TableCell>{inv.customer.companyName}</TableCell>
                <TableCell>{inv.project?.number ?? "-"}</TableCell>
                <TableCell>{formatDate(inv.dueDate)}</TableCell>
                <TableCell>{formatCurrency(Number(inv.grandTotal))}</TableCell>
                <TableCell>{formatCurrency(Number(inv.paidAmount))}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

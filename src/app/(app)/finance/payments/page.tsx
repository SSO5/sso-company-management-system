import Link from "next/link";
import { listPayments } from "@/server/finance/payments";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PaymentsPage() {
  const payments = await listPayments();
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Payments</h1><p className="text-sm text-muted-foreground">{payments.length} payment(s) recorded. Record new payments from an invoice&apos;s detail page.</p></div>
      {payments.length === 0 ? <EmptyState title="No payments recorded yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead></TableRow></TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.number}</TableCell>
                <TableCell><Link href={`/finance/invoices/${p.invoiceId}`} className="hover:underline">{p.invoice.number}</Link></TableCell>
                <TableCell>{p.customer.companyName}</TableCell>
                <TableCell>{formatDate(p.paymentDate)}</TableCell>
                <TableCell>{formatCurrency(Number(p.amount))}</TableCell>
                <TableCell>{p.method.replace("_", " ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

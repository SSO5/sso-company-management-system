import { getInvoice } from "@/server/finance/invoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const inv = await getInvoice(params.id);
  const outstanding = Number(inv.grandTotal) - Number(inv.paidAmount);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{inv.number}</p>
          <h1 className="text-xl font-semibold">{inv.customer.companyName}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge>{inv.status}</Badge>
            {inv.project && <span className="text-xs text-muted-foreground">Project {inv.project.number}</span>}
          </div>
        </div>
        {outstanding > 0 && inv.status !== "CANCELLED" && (
          <RecordPaymentDialog invoiceId={inv.id} outstanding={outstanding} trigger={<Button>Record Payment</Button>} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Dates</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice Date</span><span>{formatDate(inv.invoiceDate)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span>{formatDate(inv.dueDate)}</span></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Totals</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Grand Total</span><span>{formatCurrency(Number(inv.grandTotal))}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{formatCurrency(Number(inv.paidAmount))}</span></div>
          <div className="flex justify-between font-semibold"><span>Outstanding</span><span>{formatCurrency(outstanding)}</span></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Payments</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          {inv.payments.length === 0 && <p className="text-muted-foreground">No payments yet.</p>}
          {inv.payments.map((p) => (
            <div key={p.id} className="flex justify-between"><span>{p.number}</span><span>{formatCurrency(Number(p.amount))} · {formatDate(p.paymentDate)}</span></div>
          ))}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Unit Price</TableHead><TableHead>Tax %</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {inv.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell>{Number(it.quantity)} {it.unit}</TableCell>
                  <TableCell>{formatCurrency(Number(it.unitPrice))}</TableCell>
                  <TableCell>{Number(it.taxPercent)}%</TableCell>
                  <TableCell>{formatCurrency(Number(it.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
